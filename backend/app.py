
import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from db import get_db_connection

load_dotenv()
app = Flask(__name__)

CORS(app, resources={r"/api/*": {"origins": "*"}})


@app.route("/")
def home():
    return jsonify({"message": "Welcome to MyHelper API!"})


@app.route("/api/db-check")
def db_check():
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT DATABASE()")
        database_name = cursor.fetchone()[0]
        cursor.close()
        return jsonify({"status": "success", "database": database_name})
    except Exception:
        app.logger.exception("Database connection failed")
        return jsonify({"error": "Database connection failed"}), 500
    finally:
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    phone = data.get("phone", "").strip()
    password = data.get("password", "")
    role = data.get("role", "").strip().upper()

    if not all([name, email, phone, password, role]):
        return jsonify({"error": "All fields are required"}), 400
    if role not in ("WORKER", "OWNER"):
        return jsonify({"error": "Role must be WORKER or OWNER"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must contain at least 8 characters"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(
            """INSERT INTO users (name, email, phone, password, role)
               VALUES (%s, %s, %s, %s, %s)""",
            (name, email, phone, generate_password_hash(password), role)
        )
        user_id = cursor.lastrowid

        if role == "WORKER":
            cursor.execute(
                """INSERT INTO worker_profiles (user_id, work_type, city)
                   VALUES (%s, %s, %s)""",
                (user_id, "Not specified", "Not specified")
            )
        else:
            cursor.execute(
                "INSERT INTO owner_profiles (user_id) VALUES (%s)",
                (user_id,)
            )

        connection.commit()
        return jsonify({
            "message": "Registration successful",
            "user_id": user_id,
            "role": role
        }), 201

    except Exception as error:
        if connection:
            connection.rollback()
        if getattr(error, "errno", None) == 1062:
            return jsonify({"error": "Email or phone already registered"}), 409
        app.logger.exception("Registration failed")
        return jsonify({"error": "Registration failed"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT user_id, name, email, password, role
               FROM users WHERE email = %s""",
            (email,)
        )
        user = cursor.fetchone()

        if not user or not check_password_hash(user["password"], password):
            return jsonify({"error": "Invalid email or password"}), 401

        secret = os.getenv("JWT_SECRET_KEY")
        if not secret:
            app.logger.error("JWT_SECRET_KEY is not configured")
            return jsonify({"error": "Server configuration error"}), 500

        token = jwt.encode(
            {
                "user_id": user["user_id"],
                "role": user["role"],
                "exp": datetime.now(timezone.utc) + timedelta(hours=2)
            },
            secret,
            algorithm="HS256"
        )

        return jsonify({
            "message": "Login successful",
            "token": token,
            "user": {
                "user_id": user["user_id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"]
            }
        }), 200

    except Exception:
        app.logger.exception("Login failed")
        return jsonify({"error": "Login failed"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

@app.route("/api/availability", methods=["POST"])
def add_availability():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1], os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "WORKER":
        return jsonify({"error": "Workers only"}), 403

    data = request.get_json(silent=True) or {}
    date = data.get("available_date")
    start = data.get("start_time")
    end = data.get("end_time")
    charge = data.get("charge")

    if not all([date, start, end]) or charge is None:
        return jsonify({"error": "All availability fields are required"}), 400

    try:
        datetime.strptime(date, "%Y-%m-%d")
        start_time = datetime.strptime(start, "%H:%M").time()
        end_time = datetime.strptime(end, "%H:%M").time()
        charge = float(charge)

        if end_time <= start_time or charge < 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date, time, or charge"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT worker_id FROM worker_profiles WHERE user_id = %s",
            (payload["user_id"],)
        )
        worker = cursor.fetchone()

        if not worker:
            return jsonify({"error": "Worker profile not found"}), 404

        cursor.execute(
            """INSERT INTO availability
               (worker_id, available_date, start_time, end_time, status, charge)
               VALUES (%s, %s, %s, %s, 'AVAILABLE', %s)""",
            (worker[0], date, start, end, charge)
        )
        availability_id = cursor.lastrowid
        connection.commit()

        return jsonify({
            "message": "Availability added successfully",
            "availability_id": availability_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Adding availability failed")
        return jsonify({"error": "Could not add availability"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/availability/mine", methods=["GET"])
def my_availability():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "WORKER":
        return jsonify({"error": "Workers only"}), 403

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT a.availability_id, a.available_date,
                   a.start_time, a.end_time, a.status, a.charge
            FROM availability a
            JOIN worker_profiles w ON a.worker_id = w.worker_id
            WHERE w.user_id = %s
            ORDER BY a.available_date, a.start_time
            """,
            (payload["user_id"],)
        )

        rows = cursor.fetchall()

        for row in rows:
            row["available_date"] = str(row["available_date"])
            row["start_time"] = str(row["start_time"])
            row["end_time"] = str(row["end_time"])
            row["charge"] = float(row["charge"])

        return jsonify({"availability": rows})

    except Exception:
        app.logger.exception("Fetching availability failed")
        return jsonify({"error": "Could not fetch availability"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/profile", methods=["GET"])
def get_worker_profile():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "WORKER":
        return jsonify({"error": "Only workers can access this profile"}), 403

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                wp.work_type,
                wp.experience_years,
                wp.city,
                wp.area,
                wp.description
            FROM worker_profiles wp
            WHERE wp.user_id = %s
        """, (payload["user_id"],))

        profile = cursor.fetchone()

        if not profile:
            return jsonify({"error": "Worker profile not found"}), 404

        return jsonify({"profile": profile}), 200

    except Exception as e:
        print("Profile fetch error:", e)
        return jsonify({"error": "Could not fetch profile"}), 500

    finally:
        cursor.close()
        conn.close()


@app.route("/api/profile", methods=["PUT"])
def update_worker_profile():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "WORKER":
        return jsonify({"error": "Only workers can update profiles"}), 403

    data = request.get_json(silent=True) or {}

    work_type = str(data.get("work_type") or "").strip()
    city = str(data.get("city") or "").strip()
    area = str(data.get("area") or "").strip()
    description = str(data.get("description") or "").strip()

    try:
        experience = int(data.get("experience_years"))
        if experience < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Enter valid experience years"}), 400

    if not work_type or not city or not area:
        return jsonify({"error": "Work type, city and area are required"}), 400

    conn = None
    cursor = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE worker_profiles
            SET work_type = %s,
                experience_years = %s,
                city = %s,
                area = %s,
                description = %s
            WHERE user_id = %s
        """, (
            work_type,
            experience,
            city,
            area,
            description,
            payload["user_id"]
        ))

        if cursor.rowcount == 0:
            cursor.execute(
                "SELECT worker_id FROM worker_profiles WHERE user_id = %s",
                (payload["user_id"],)
            )
            if cursor.fetchone() is None:
                return jsonify({"error": "Worker profile not found"}), 404

        conn.commit()

        return jsonify({
            "message": "Profile updated successfully"
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print("Profile update error:", e)
        return jsonify({"error": "Could not update profile"}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



@app.route("/api/workers/search", methods=["GET"])
def search_workers():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "OWNER":
        return jsonify({"error": "Only owners can search workers"}), 403

    work_type = request.args.get("work_type", "").strip()
    city = request.args.get("city", "").strip()
    available_date = request.args.get("date", "").strip()
    max_charge = request.args.get("max_charge", "").strip()

    conditions = ["a.status = 'AVAILABLE'"]
    params = []

    if work_type:
        conditions.append("wp.work_type LIKE %s")
        params.append(f"%{work_type}%")

    if city:
        conditions.append("wp.city LIKE %s")
        params.append(f"%{city}%")

    if available_date:
        try:
            datetime.strptime(available_date, "%Y-%m-%d")
        except ValueError:
            return jsonify({
                "error": "Date must use YYYY-MM-DD format"
            }), 400

        conditions.append("a.available_date = %s")
        params.append(available_date)

    if max_charge:
        try:
            charge_limit = float(max_charge)
            if charge_limit < 0:
                raise ValueError()
        except ValueError:
            return jsonify({
                "error": "max_charge must be a non-negative number"
            }), 400

        conditions.append("a.charge <= %s")
        params.append(charge_limit)

    query = f"""
        SELECT
            wp.worker_id,
            u.name,
            wp.work_type,
            wp.experience_years,
            wp.city,
            wp.area,
            wp.description,
            a.availability_id,
            a.available_date,
            a.start_time,
            a.end_time,
            a.charge
        FROM worker_profiles wp
        JOIN users u ON u.user_id = wp.user_id
        JOIN availability a ON a.worker_id = wp.worker_id
        WHERE {" AND ".join(conditions)}
        ORDER BY a.available_date, a.start_time
    """

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, params)
        workers = cursor.fetchall()

        for worker in workers:
            worker["available_date"] = str(worker["available_date"])
            worker["start_time"] = str(worker["start_time"])
            worker["end_time"] = str(worker["end_time"])
            worker["charge"] = float(worker["charge"])

        return jsonify({
            "count": len(workers),
            "workers": workers
        }), 200

    except Exception:
        app.logger.exception("Worker search failed")
        return jsonify({"error": "Could not search workers"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

@app.route("/api/work-requests", methods=["POST"])
def create_work_request():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "OWNER":
        return jsonify({"error": "Only owners can send requests"}), 403

    data = request.get_json(silent=True) or {}
    availability_id = data.get("availability_id")
    message = data.get("message", "").strip()

    if availability_id is None:
        return jsonify({"error": "availability_id is required"}), 400

    try:
        availability_id = int(availability_id)
        if availability_id <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid availability_id"}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Find the owner's profile
        cursor.execute(
            "SELECT owner_id FROM owner_profiles WHERE user_id = %s",
            (payload["user_id"],)
        )
        owner = cursor.fetchone()

        if not owner:
            return jsonify({"error": "Owner profile not found"}), 404

        owner_id = owner[0]

        # Check that the selected availability is still available
        cursor.execute(
            """
            SELECT worker_id
            FROM availability
            WHERE availability_id = %s
              AND status = 'AVAILABLE'
            """,
            (availability_id,)
        )
        slot = cursor.fetchone()

        if not slot:
            return jsonify({
                "error": "Availability not found or no longer available"
            }), 404

        worker_id = slot[0]

        cursor.execute(
            """
            INSERT INTO work_requests
                (owner_id, worker_id, availability_id, message, status)
            VALUES (%s, %s, %s, %s, 'PENDING')
            """,
            (owner_id, worker_id, availability_id, message)
        )

        request_id = cursor.lastrowid
        connection.commit()

        return jsonify({
            "message": "Work request sent successfully",
            "request_id": request_id,
            "status": "PENDING"
        }), 201

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Creating work request failed")
        return jsonify({"error": "Could not create work request"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

@app.route("/api/work-requests", methods=["GET"])
def get_work_requests():
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") not in ("OWNER", "WORKER"):
        return jsonify({"error": "Invalid role"}), 403

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        if payload["role"] == "OWNER":
            cursor.execute(
                """
                SELECT
                    wr.request_id,
                    wr.message,
                    wr.status,
                    wr.created_at,
                    u.name AS worker_name,
                    wp.work_type,
                    a.available_date,
                    a.start_time,
                    a.end_time,
                    a.charge
                FROM work_requests wr
                JOIN owner_profiles op ON wr.owner_id = op.owner_id
                JOIN worker_profiles wp ON wr.worker_id = wp.worker_id
                JOIN users u ON wp.user_id = u.user_id
                JOIN availability a
                    ON wr.availability_id = a.availability_id
                WHERE op.user_id = %s
                ORDER BY wr.created_at DESC
                """,
                (payload["user_id"],)
            )
        else:
            cursor.execute(
                """
                SELECT
                    wr.request_id,
                    wr.message,
                    wr.status,
                    wr.created_at,
                    u.name AS owner_name,
                    wp.work_type,
                    a.available_date,
                    a.start_time,
                    a.end_time,
                    a.charge
                FROM work_requests wr
                JOIN worker_profiles wp ON wr.worker_id = wp.worker_id
                JOIN users worker_user ON wp.user_id = worker_user.user_id
                JOIN owner_profiles op ON wr.owner_id = op.owner_id
                JOIN users u ON op.user_id = u.user_id
                JOIN availability a
                    ON wr.availability_id = a.availability_id
                WHERE worker_user.user_id = %s
                ORDER BY wr.created_at DESC
                """,
                (payload["user_id"],)
            )

        requests_list = cursor.fetchall()

        for item in requests_list:
            item["created_at"] = str(item["created_at"])
            item["available_date"] = str(item["available_date"])
            item["start_time"] = str(item["start_time"])
            item["end_time"] = str(item["end_time"])
            item["charge"] = float(item["charge"])

        return jsonify({
            "count": len(requests_list),
            "requests": requests_list
        }), 200

    except Exception:
        app.logger.exception("Fetching work requests failed")
        return jsonify({"error": "Could not fetch work requests"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

@app.route("/api/work-requests/<int:request_id>", methods=["PATCH"])
def respond_to_request(request_id):
    auth = request.headers.get("Authorization", "").split()

    if len(auth) != 2 or auth[0].lower() != "bearer":
        return jsonify({"error": "Token required"}), 401

    try:
        payload = jwt.decode(
            auth[1],
            os.getenv("JWT_SECRET_KEY"),
            algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload.get("role") != "WORKER":
        return jsonify({"error": "Workers only"}), 403

    data = request.get_json(silent=True) or {}
    status = data.get("status", "").upper()

    if status not in ("ACCEPTED", "REJECTED"):
        return jsonify({
            "error": "Status must be ACCEPTED or REJECTED"
        }), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        connection.start_transaction()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT wr.request_id, wr.status, wr.availability_id
            FROM work_requests wr
            JOIN worker_profiles wp
                ON wr.worker_id = wp.worker_id
            WHERE wr.request_id = %s
              AND wp.user_id = %s
            FOR UPDATE
            """,
            (request_id, payload["user_id"])
        )

        work_request = cursor.fetchone()

        if not work_request:
            connection.rollback()
            return jsonify({"error": "Request not found"}), 404

        if work_request["status"] != "PENDING":
            connection.rollback()
            return jsonify({
                "error": "This request has already been processed"
            }), 409

        if status == "ACCEPTED":
            cursor.execute(
                """
                SELECT status FROM availability
                WHERE availability_id = %s
                FOR UPDATE
                """,
                (work_request["availability_id"],)
            )

            slot = cursor.fetchone()

            if not slot or slot["status"] != "AVAILABLE":
                connection.rollback()
                return jsonify({
                    "error": "This availability slot is no longer available"
                }), 409

            cursor.execute(
                """
                UPDATE availability
                SET status = 'BOOKED'
                WHERE availability_id = %s
                """,
                (work_request["availability_id"],)
            )

        cursor.execute(
            """
            UPDATE work_requests
            SET status = %s
            WHERE request_id = %s
            """,
            (status, request_id)
        )

        connection.commit()

        return jsonify({
            "message": f"Request {status.lower()} successfully",
            "request_id": request_id,
            "status": status
        }), 200

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Responding to work request failed")
        return jsonify({"error": "Could not update work request"}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

if __name__ == "__main__":
    app.run(debug=True)
