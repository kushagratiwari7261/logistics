import io
import json
import tempfile
import os
import logging
from datetime import datetime
from typing import List
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from deepface import DeepFace
from haversine import haversine, Unit
import cv2

from config import settings
from auth import get_current_user

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Smart Attendance System Backend",
    description="Python FastAPI backend powering pgvector face recognition and geofencing for attendance tracking.",
    version="1.0.0"
)

# CORS configuration — allow all origins so the frontend and Node.js backend can call freely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase client lazily to avoid crashing on import when env vars are not yet available
supabase: Client = None

@app.on_event("startup")
async def startup_event():
    """Initialize Supabase client on startup so env vars are guaranteed to be loaded."""
    global supabase
    try:
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
            supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
            logger.info("Supabase client initialized successfully.")
        else:
            logger.warning("Supabase credentials not set — skipping client init. API calls will fail until configured.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        # Don't raise — let the app start so healthcheck can pass

def get_supabase() -> Client:
    """Get the Supabase client, raising a clear error if not initialized."""
    if supabase is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database client is not initialized."
        )
    return supabase

# ----------------------------------------------------
# Math Utilities
# ----------------------------------------------------

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes the great-circle distance between two points in meters
    using the haversine library.
    """
    return haversine((lat1, lon1), (lat2, lon2), unit=Unit.METERS)

# ----------------------------------------------------
# Authorization Helpers
# ----------------------------------------------------

def is_admin(email: str) -> bool:
    """Checks if an email is listed in the admins database table."""
    try:
        res = supabase.table("admins").select("is_super_admin").eq("email", email.strip().lower()).execute()
        return len(res.data) > 0
    except Exception:
        return False

def is_super_admin(email: str) -> bool:
    """Checks if an email is a whitelisted Super Admin in the database."""
    try:
        res = supabase.table("admins").select("is_super_admin").eq("email", email.strip().lower()).execute()
        return len(res.data) > 0 and res.data[0].get("is_super_admin", False)
    except Exception:
        return False

# ----------------------------------------------------
# API Endpoints
# ----------------------------------------------------

@app.get("/api/health")
async def health_check():
    """Health check endpoint to wake up server and confirm connection."""
    return {
        "status": "healthy",
        "service": "Smart Attendance System Backend",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/geofence-check")
async def check_geofence(
    latitude: float = Form(...),
    longitude: float = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Validates user coordinates against the registered office geofence.
    """
    # Fetch office configurations
    res = supabase.table("office_config").select("*").eq("id", 1).execute()
    if res.data:
        office = res.data[0]
        office_lat = office["lat"]
        office_lng = office["lng"]
        radius = office["radius_meters"]
    else:
        # Fall back to env variables
        office_lat = settings.OFFICE_LAT
        office_lng = settings.OFFICE_LNG
        radius = settings.OFFICE_RADIUS_METERS

    distance = haversine_distance(latitude, longitude, office_lat, office_lng)
    inside_geofence = distance <= radius

    return {
        "inside_geofence": inside_geofence,
        "distance_m": distance,
        "office_lat": office_lat,
        "office_lng": office_lng,
        "office_radius_meters": radius
    }

@app.post("/api/face-match")
async def face_match(
    image: UploadFile = File(...),
    latitude: float = Form(None),
    longitude: float = Form(None),
    direction_used: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Processes the biometric frame, matches face encodings against the employee profile,
    performs late-shifts and geofence evaluations, and logs the attendance.
    """
    email = current_user["email"].strip().lower()

    # 1. Fetch active employee details
    emp_res = supabase.table("employees").select("*").eq("email", email).eq("is_active", True).execute()
    if not emp_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile not found or is currently inactive."
        )
    employee = emp_res.data[0]
    emp_id = employee["id"]
    emp_name = employee["name"]
    emp_role = employee["role"]
    stored_encoding = employee.get("face_encoding")

    if not stored_encoding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No registered face encoding exists for your account. Please consult an administrator."
        )

    # 2. Parse vector encoding
    if isinstance(stored_encoding, str):
        stored_encoding = json.loads(stored_encoding)
    stored_encoding_arr = np.array(stored_encoding, dtype=float)

    # 3. Process webcam image frame — save to temp file for DeepFace
    try:
        contents = await image.read()
        img_array = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image buffer.")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Corrupt or invalid image frame uploaded: {str(e)}"
        )

    # 4. Generate face embedding via DeepFace (Facenet512 model)
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = tmp.name
            cv2.imwrite(tmp_path, frame)

        result = DeepFace.represent(
            img_path=tmp_path,
            model_name="Facenet512",
            enforce_detection=True,
            detector_backend="opencv"
        )
        os.unlink(tmp_path)

        if not result:
            raise ValueError("No face embedding returned.")

        user_encoding_arr = np.array(result[0]["embedding"], dtype=float)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Face detection failed: No face detected in camera viewport. ({str(e)})"
        )

    # 5. Cosine Distance Calculation against stored embedding
    dot_product = np.dot(stored_encoding_arr, user_encoding_arr)
    norm_stored = np.linalg.norm(stored_encoding_arr)
    norm_user = np.linalg.norm(user_encoding_arr)

    if norm_stored == 0 or norm_user == 0:
        cosine_dist = 1.0
    else:
        cosine_dist = 1.0 - (dot_product / (norm_stored * norm_user))

    # Facenet512 match threshold: < 0.30 cosine distance is a confirmed match
    is_match = cosine_dist < 0.30
    if not is_match:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Biometric verification failed: Face not recognized."
        )

    # 6. Geofencing check for Office Staff
    inside_geofence = None
    distance_m = None
    if emp_role == "office":
        if latitude is None or longitude is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GPS coordinates are mandatory for Office Staff."
            )

        # Get active office coordinates
        config_res = supabase.table("office_config").select("*").eq("id", 1).execute()
        if config_res.data:
            office = config_res.data[0]
            office_lat = office["lat"]
            office_lng = office["lng"]
            radius = office["radius_meters"]
        else:
            office_lat = settings.OFFICE_LAT
            office_lng = settings.OFFICE_LNG
            radius = settings.OFFICE_RADIUS_METERS

        distance_m = haversine_distance(latitude, longitude, office_lat, office_lng)
        inside_geofence = distance_m <= radius

        if not inside_geofence:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Verification blocked: You are outside office boundaries (Distance: {distance_m:.1f}m)."
            )

    # 7. Timelimit Check (Late Flagging)
    status_str = "Present"
    config_res = supabase.table("office_config").select("*").eq("id", 1).execute()
    if config_res.data:
        office = config_res.data[0]
        start_time_str = office["start_time"]  # e.g. "09:00:00"
        grace_mins = office["grace_period_minutes"]

        try:
            shift_start = datetime.strptime(start_time_str, "%H:%M:%S").time()
            now = datetime.now()
            current_time = now.time()

            shift_mins = shift_start.hour * 60 + shift_start.minute
            limit_mins = shift_mins + grace_mins
            current_mins = current_time.hour * 60 + current_time.minute

            if current_mins > limit_mins:
                status_str = "Late"
        except Exception:
            pass  # Fallback to Present if timing configuration values fail parsing

    # 8. Insert record in Supabase (Prevent Double-logging)
    today_str = datetime.now().date().isoformat()
    existing_att = supabase.table("attendance")\
        .select("id")\
        .eq("employee_id", emp_id)\
        .eq("date", today_str)\
        .execute()

    if existing_att.data:
        return {
            "success": True,
            "already_marked": True,
            "message": "Attendance already marked for today.",
            "status": "Present",
            "marked_at": datetime.now().isoformat()
        }

    attendance_data = {
        "employee_id": emp_id,
        "name": emp_name,
        "role": emp_role,
        "latitude": latitude,
        "longitude": longitude,
        "distance_m": distance_m,
        "inside_geofence": inside_geofence,
        "face_matched": True,
        "direction_used": direction_used,
        "status": status_str,
        "marked_at": datetime.now().isoformat(),
        "date": today_str
    }

    ins_res = supabase.table("attendance").insert(attendance_data).execute()
    if not ins_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database write failure: Could not record attendance log."
        )

    return {
        "success": True,
        "message": f"Biometric attendance logged successfully as {status_str}.",
        "distance_m": distance_m,
        "status": status_str,
        "marked_at": attendance_data["marked_at"]
    }

@app.post("/api/enroll-employee")
async def enroll_employee(
    name: str = Form(...),
    email: str = Form(...),
    role: str = Form(...),
    images: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Creates or updates an employee profile with averaged face encodings
    from 3 to 5 uploaded camera frames. (Admin Only)
    """
    admin_email = current_user["email"].strip().lower()

    # Check Admin Role
    if not is_admin(admin_email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Enrollment rejected: Admin privileges are required."
        )

    if len(images) < 3 or len(images) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Biometric enrollment requires between 3 and 5 high-quality face photographs."
        )

    encodings = []
    for idx, img_file in enumerate(images):
        try:
            contents = await img_file.read()
            img_array = np.frombuffer(contents, np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("Cannot decode image.")

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = tmp.name
                cv2.imwrite(tmp_path, frame)

            result = DeepFace.represent(
                img_path=tmp_path,
                model_name="Facenet512",
                enforce_detection=True,
                detector_backend="opencv"
            )
            os.unlink(tmp_path)

            if not result:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Face registration failed: No face detected in photograph number {idx+1}."
                )
            encodings.append(np.array(result[0]["embedding"], dtype=float))

        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed loading face photo {idx+1}: {str(e)}"
            )

    # Average vectors to lock face variance characteristics
    avg_encoding = np.mean(encodings, axis=0)
    encoding_list = avg_encoding.tolist()

    employee_data = {
        "name": name,
        "email": email.strip().lower(),
        "role": role,
        "face_encoding": encoding_list,
        "is_active": True
    }

    # Check for existing profile updates
    existing = supabase.table("employees").select("id").eq("email", email.strip().lower()).execute()
    if existing.data:
        emp_id = existing.data[0]["id"]
        res = supabase.table("employees").update(employee_data).eq("id", emp_id).execute()
    else:
        res = supabase.table("employees").insert(employee_data).execute()

    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database write failure: Could not enroll employee."
        )

    return {
        "success": True,
        "message": f"Successfully registered employee profile '{name}' with averaged face signature.",
        "employee_id": res.data[0]["id"]
    }

@app.post("/api/office-config")
async def update_office_config(
    lat: float = Form(...),
    lng: float = Form(...),
    radius_meters: float = Form(...),
    start_time: str = Form(...),   # 'HH:MM:SS'
    end_time: str = Form(...),     # 'HH:MM:SS'
    grace_period_minutes: int = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Updates global office timings, grace boundaries, and GPS geofence constraints.
    (Super Admin Only)
    """
    email = current_user["email"].strip().lower()
    if not is_super_admin(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privileges are required to edit global office settings."
        )

    try:
        datetime.strptime(start_time, "%H:%M:%S")
        datetime.strptime(end_time, "%H:%M:%S")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid timing formats. Use 24-hour style format 'HH:MM:SS'."
        )

    config_data = {
        "lat": lat,
        "lng": lng,
        "radius_meters": radius_meters,
        "start_time": start_time,
        "end_time": end_time,
        "grace_period_minutes": grace_period_minutes,
        "updated_at": datetime.now().isoformat()
    }

    # Update ID = 1 configurations row
    res = supabase.table("office_config").update(config_data).eq("id", 1).execute()
    if not res.data:
        config_data["id"] = 1
        res = supabase.table("office_config").insert(config_data).execute()

    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save configuration details."
        )

    return {
        "success": True,
        "message": "Office geofencing configurations successfully updated.",
        "config": res.data[0]
    }

@app.post("/api/holidays")
async def add_holiday(
    name: str = Form(...),
    holiday_date: str = Form(...),  # 'YYYY-MM-DD'
    current_user: dict = Depends(get_current_user)
):
    """
    Appends a new company holiday to prevent automatic absentee reports.
    (Super Admin Only)
    """
    email = current_user["email"].strip().lower()
    if not is_super_admin(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privileges are required to register holidays."
        )

    try:
        parsed_date = datetime.strptime(holiday_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid holiday date format. Use 'YYYY-MM-DD'."
        )

    holiday_data = {
        "name": name,
        "holiday_date": parsed_date.isoformat()
    }

    res = supabase.table("holidays").insert(holiday_data).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A holiday registration already exists for this date."
        )

    return {
        "success": True,
        "message": f"Holiday '{name}' successfully established for {holiday_date}.",
        "holiday": res.data[0]
    }

@app.delete("/api/holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Deletes a holiday date from the company registry.
    (Super Admin Only)
    """
    email = current_user["email"].strip().lower()
    if not is_super_admin(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privileges are required to remove holidays."
        )

    res = supabase.table("holidays").delete().eq("id", holiday_id).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Specified holiday record does not exist."
        )

    return {
        "success": True,
        "message": "Holiday successfully deleted."
    }
