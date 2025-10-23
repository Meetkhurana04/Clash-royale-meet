from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from flask_socketio import SocketIO, join_room as fs_join_room, leave_room as fs_leave_room, emit
import random
from string import ascii_uppercase
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = "your_secret_key_here"
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, manage_session=False)

# in-memory mapping: room_code -> { sid: username }
room_members = {}



class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "created_at": self.created_at.isoformat()
        }

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(16), unique=True, nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    members = db.Column(db.Integer, default=0)
    is_private = db.Column(db.Boolean, default=False)   # <-- new
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "owner_id": self.owner_id,
            "members": self.members,
            "is_private": bool(self.is_private),
            "created_at": self.created_at.isoformat()
        }

def roomcode(length=4):
    while True:
        code = "".join(random.choice(ascii_uppercase) for _ in range(length))
        if not Room.query.filter_by(code=code).first() and code not in room_members:
            return code

def current_user():
    uid = session.get('user_id')
    if not uid:
        return None
    return User.query.get(uid)

@app.route("/initdb")
def initdb():
    db.create_all()
    return "DB created"

@app.route("/", methods=["GET", "POST"])
def home():
    if request.method == "GET":
        return render_template("index.html")

    # POST -> create or join room
    user = current_user()
    if not user:
        return render_template("index.html", error="You must be logged in to create or join rooms.")

    name = request.form.get("name") or user.username
    code = request.form.get("code", "").strip().upper()
    join = request.form.get("join", "")
    create = request.form.get("create", "")
    is_private_flag = request.form.get("is_private", False)  # optional from form (checkbox)

    if not name:
        return render_template("index.html", error="Please enter a name")

    if join and not code:
        return render_template("index.html", error="Please enter a room code to join")

    room_code = code
    if create:
        room_code = roomcode(4)
        new_room = Room(code=room_code, owner_id=user.id, members=0, is_private=(is_private_flag == "1"))
        # upar waali line new row bnayegi humare room wale table me 
        db.session.add(new_room) # yeh chij btayega ki m ready hu add krdna yeh temporary memory store horhi hoti h 
        db.session.commit() # yeh chij h ki jo jo chij session me aayi h use commit krdo
        # you cant commit directly without add add kro then commit yeh hi procedure h 
    else:
        # join: validate room exists and not full and not private (unless owner)
        db_room = Room.query.filter_by(code=room_code).first()
        # “Room table me us room ko dhoondo jiska code room_code ke barabar hai, aur uska pehla record le aao.”
        if not db_room:
            return render_template("index.html", error="No such room.")
        if db_room.is_private and db_room.owner_id != user.id:
            return render_template("index.html", error="Room is private.")
        # Use DB count as a pre-check (socket-level also enforces)
        if db_room.members >= 2:
            return render_template("index.html", error="Room is full.")

    # set session values and redirect to room page (not ball)
    session["room"] = room_code
    session["name"] = name
    return redirect(url_for("room_page"))

@app.route("/room")
def room_page():
    if "room" not in session or "name" not in session:
        return redirect(url_for("home"))
    # yeh def home wale funciton pe redirect krdega not url
    room_code = session["room"]
    name = session["name"]
    user = current_user()
    user_id = user.id if user else None
    return render_template("room.html", room=room_code, name=name, user_id=user_id)

@app.route("/ball")
def ball_page():
    ai_mode = False
    return render_template("ball.html", ai_mode=ai_mode)

@app.route("/multi")
def multi():
    multi = True
    ai_mode = False
    room = request.args.get("room")
    return render_template("ball.html",multi=multi,ai_mode=ai_mode ,room=room)

@app.route("/ai")
def ai():
    ai_mode = True
    return render_template("ball.html", ai_mode=ai_mode)

@app.route("/api/register", methods=["POST"])
def api_register():
    username = request.form.get("username") or (request.json and request.json.get("username"))
    email = request.form.get("email") or (request.json and request.json.get("email"))
    password = request.form.get("password") or (request.json and request.json.get("password"))
    if not username or not password or not email:
        return jsonify({"ok": False, "error": "username, email and password required"}), 400
    username = username.strip()
    if User.query.filter_by(username=username).first():
        return jsonify({"ok": False, "error": "username taken"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"ok": False, "error": "email already used"}), 400

    pw_hash = generate_password_hash(password)
    u = User(username=username, email=email, password_hash=pw_hash)
    db.session.add(u)
    db.session.commit()

    session['user_id'] = u.id
    return jsonify({"ok": True, "user": u.to_dict()})

@app.route("/api/login", methods=["POST"])
def api_login():
    username = request.form.get("username") or (request.json and request.json.get("username"))
    password = request.form.get("password") or (request.json and request.json.get("password"))
    if not username or not password:
        return jsonify({"ok": False, "error": "username & password required"}), 400
    u = User.query.filter_by(username=username).first()
    if not u or not check_password_hash(u.password_hash, password):
        return jsonify({"ok": False, "error": "invalid credentials"}), 401
    session['user_id'] = u.id
    return jsonify({"ok": True, "user": u.to_dict()})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.pop('user_id', None)
    session.pop('room', None)
    session.pop('name', None)
    return jsonify({"ok": True})

@app.route("/api/auth")
def api_auth():
    u = current_user()
    if not u:
        return jsonify({"ok": False, "user": None})
    return jsonify({"ok": True, "user": u.to_dict()})
@socketio.on("join_room")
def handle_join_room(data):
    room = data.get("room")
    if not room:
        emit("room_error", {"error": "Missing room"}, to=request.sid)
        return
    try:
        fs_join_room(room)
        # send single-client confirmation
        emit("room_joined", {"room": room}, to=request.sid)
        # also send room_update to everyone in that room (optional)
        members = room_members.get(room, {})
        member_names = [m["name"] for m in members.values()] if members else []
        emit("room_update", {"room": room, "members": member_names}, room=room)
    except Exception as e:
        app.logger.exception("join_room failed")
        emit("room_error", {"error": "Failed to join room"}, to=request.sid)

# Socket events
@socketio.on("spawn_character")
def handle_spawn(data):
    room = data.get("room")
    data["sender_sid"] = request.sid  # mark sender
    # broadcast to the room except the sender
    emit("spawn_character", data, to=room, skip_sid=request.sid)

@socketio.on("join")
def handle_join(data):
    """
    data = { "room": "ABCD", "name": "player1", "user_id": 3 }
    """
    room = data.get("room")
    name = data.get("name")
    user_id = data.get("user_id")
    sid = request.sid

    if not room or not name:
        return

    # check db room exist & privacy
    db_room = Room.query.filter_by(code=room).first()
    if not db_room:
        emit("room_error", {"error": "Room does not exist."}, to=sid)
        return

    # if private and joiner is not owner => reject
    if db_room.is_private and db_room.owner_id != user_id:
        emit("room_private", {"error": "Room is private."}, to=sid)
        return

    members = room_members.setdefault(room, {})
    # if room already full -> reject
    if len(members) >= 2:
        emit("room_full", {"error": "Room is full."}, to=sid)
        return

    # add member
    members[sid] = {"name": name, "user_id": user_id}
    # update DB members count
    db_room.members = len(members)
    db.session.commit()

    # join socket room
    fs_join_room(room)

    # prepare simple member name list and owner name
    member_names = [m["name"] for m in members.values()]
    owner = User.query.get(db_room.owner_id)
    owner_name = owner.username if owner else None

    emit("room_update", {"room": room, "members": member_names, "is_private": bool(db_room.is_private), "owner": owner_name}, room=room)

@socketio.on("leave")
def handle_leave(data):
    room = data.get("room")
    sid = request.sid
    if not room:
        return
    members = room_members.get(room, {})
    if sid in members:
        members.pop(sid)
    db_room = Room.query.filter_by(code=room).first()
    if db_room:
        db_room.members = len(members)
        db.session.commit()
    fs_leave_room(room)
    member_names = [m["name"] for m in members.values()]
    owner = db_room and User.query.get(db_room.owner_id)
    owner_name = owner.username if owner else None
    emit("room_update", {"room": room, "members": member_names, "is_private": bool(db_room.is_private) if db_room else False, "owner": owner_name}, room=room)

    # cleanup if empty
    if len(members) == 0:
        room_members.pop(room, None)
        if db_room:
            try:
                db.session.delete(db_room)
                db.session.commit()
            except Exception:
                db.session.rollback()

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    rooms_to_cleanup = []
    for room, members in list(room_members.items()):
        if sid in members:
            members.pop(sid)
            db_room = Room.query.filter_by(code=room).first()
            if db_room:
                db_room.members = len(members)
                db.session.commit()
            emit("room_update", {"room": room, "members": [m["name"] for m in members.values()], "is_private": bool(db_room.is_private) if db_room else False}, room=room)
            if len(members) == 0:
                rooms_to_cleanup.append((room, db_room))
    for room, db_room in rooms_to_cleanup:
        room_members.pop(room, None)
        if db_room:
            try:
                db.session.delete(db_room)
                db.session.commit()
            except Exception:
                db.session.rollback()

@socketio.on("toggle_privacy")
def handle_toggle_privacy(data):
    """
    data = { "room": "ABCD", "is_private": true/false, "user_id": 3 }
    """
    room = data.get("room")
    is_private = bool(data.get("is_private"))
    user_id = data.get("user_id")
    if not room:
        return
    db_room = Room.query.filter_by(code=room).first()
    if not db_room:
        emit("room_error", {"error": "Room not found."})
        return
    # only owner allowed
    if db_room.owner_id != user_id:
        emit("room_error", {"error": "Only owner can change privacy."}, to=request.sid)
        return
    db_room.is_private = is_private
    db.session.commit()
    # notify all members
    members = room_members.get(room, {})
    member_names = [m["name"] for m in members.values()]
    owner = User.query.get(db_room.owner_id)
    owner_name = owner.username if owner else None
    emit("room_update", {"room": room, "members": member_names, "is_private": bool(db_room.is_private), "owner": owner_name}, room=room)

@socketio.on("start_game")
def handle_start_game(data):
    """
    data = { "room": "ABCD", "user_id": 3 }
    """
    room = data.get("room")
    user_id = data.get("user_id")
    if not room:
        return
    db_room = Room.query.filter_by(code=room).first()
    if not db_room:
        emit("room_error", {"error": "Room not found."}, to=request.sid)
        return
    # only owner can start and only when exactly 2 players
    if db_room.owner_id != user_id:
        emit("room_error", {"error": "Only owner can start the game."}, to=request.sid)
        return
    members = room_members.get(room, {})
    if len(members) != 2:
        emit("room_error", {"error": "Need exactly 2 players to start."}, to=request.sid)
        return
    # All good -> notify clients to start (clients handle redirect)
    emit("start", {"room": room}, room=room)

from flask import copy_current_request_context

@socketio.on("spawn_request")
def handle_spawn_request(data):
    """
    Client sends:
    { room, type, xPct, yPct, localId }
    """
    room = data.get("room")
    if not room:
        return
    # attach sender id
    data["sender_sid"] = request.sid
    st = ensure_room_state(room)
    st["input_queue"].append(data)

@socketio.on("join_room")
def handle_join_room(data):
    room = data.get("room")
    if not room:
        return
    fs_join_room(room)
    # Ensure state exists
    st = ensure_room_state(room)
    # Optionally initialize timer when room ready
    if st["start_time"] is None:
        st["start_time"] = datetime.noww()
        st["time_left"] = gametime if 'gametime' in globals() else 60  # fallback
    # send ack back to the client only
    emit("room_joined", {"room": room, "tick": st["tick"], "time_left": st.get("time_left")}, to=request.sid)

import time
import uuid

SERVER_TICK_HZ = 15.0
SERVER_DT = 1.0 / SERVER_TICK_HZ

def server_tick_loop():
    while True:
        try:
            now = datetime.utcnow()
            for room, st in list(rooms_state.items()):
                # 1) process queued spawn requests
                while st["input_queue"]:
                    req = st["input_queue"].pop(0)
                    # create server entity id
                    server_id = f"{room}_{uuid.uuid4().hex[:8]}"
                    ent = {
                        "id": server_id,
                        "type": req.get("type"),
                        "xPct": float(req.get("xPct", 0.5)),
                        "yPct": float(req.get("yPct", 0.5)),
                        "hp": 100,
                        "owner_sid": req.get("sender_sid"),
                        "localId": req.get("localId"),    # echo client local id for reconciliation
                        "created_at": now.isoformat()
                        # optionally add vx, vy if you run physics on server
                    }
                    st["entities"][server_id] = ent

                # 2) simple server-step: (optionally update entity physics here)
                # For now we keep positions static. If you want server-side movement, update xPct/yPct here.

                # 3) Create snapshot
                snapshot = {
                    "room": room,
                    "tick": st["tick"],
                    "time_left": st.get("time_left"),
                    "entities": list(st["entities"].values())
                }
                # Broadcast to room
                socketio.emit("snapshot", snapshot, room=room)

                st["tick"] += 1

            socketio.sleep(SERVER_DT)
        except Exception as e:
            app.logger.exception("Tick loop error: %s", e)
            socketio.sleep(SERVER_DT)

# start background task when server starts
def start_server_tick():
    socketio.start_background_task(target=server_tick_loop)


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    start_server_tick()
    socketio.run(app, debug=True)
