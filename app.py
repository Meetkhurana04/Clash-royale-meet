from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from flask_socketio import SocketIO, join_room as fs_join_room, leave_room as fs_leave_room, emit
import random
from string import ascii_uppercase
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text as sa_text
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import time
import sys
import platform

app = Flask(__name__)
app.secret_key = "your_secret_key_here"
# Update with your Supabase PostgreSQL connection string
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:iluvmyfamily!23@db.xsmrqbtwdmiorlymejdl.supabase.co:5432/postgres'
# Recommended production settings for PostgreSQL
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
    'pool_size': 5,
    'max_overflow': 10
}
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['APP_START_TIME'] = time.time()

db = SQLAlchemy(app)
socketio = SocketIO(app, manage_session=False, async_mode='gevent')

# in-memory mapping: room_code -> { sid: username }
room_members = {}

# Track which rooms have active games (game started, not just waiting)
active_games = set()  # stores room codes where game is active



class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    trophies = db.Column(db.Integer, default=0)
    match_wins = db.Column(db.Integer, default=0)
    total_matches = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "created_at": self.created_at.isoformat(),
            "trophies": self.trophies,
            "match_wins": self.match_wins,
            "total_matches": self.total_matches
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
    # uid me hum session se user id nikal lenge 
    if not uid:
        return None # agar nhi h toh none dedenge 
    # agar h toh hum database se nikalwaldenge 
    return User.query.get(uid)
# Ye line database se ek specific user record nikalti hai — jiska primary key (ID) uid hota hai.

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
    # Yeh lines data store kar rahi hain Flask ke session object me.
    return redirect(url_for("room_page"))

@app.route("/room")
def room_page():
    if "room" not in session or "name" not in session:
        return redirect(url_for("home"))
    # yeh def home wale funciton pe redirect krdega not url
    room_code = session["room"]
    name = session["name"]
    # yeh lines session se data read kar rhi h 
    user = current_user()
    # yeh kya krega humra crrentuser wala inbuitl functin chalayega
    # yeh wala function phle toh try krega ki session se ajaye but agar session se nhi aati toh 
    # agar uid  nhi h toh none return krdo ki login failed h 
    # if uid miljaati h exist krti h toh database user table me jaake primarykey = uid wales user ko fetch krt ah 

    user_id = user.id if user else None
    # user_id agar user exist krta h toh = user id hoga nhi toh none hoga 
    # agar user = none arha hota toh yha pe bhi user_id = none hota 
    return render_template("room.html", room=room_code, name=name, user_id=user_id)

@app.route("/ball")
def ball_page():
    ai_mode = False
    user = current_user()
    name = user.username if user else session.get('name', 'Player')
    return render_template("ball.html", ai_mode=ai_mode, name=name)

@app.route("/multi")
def multi():
    multi = True
    ai_mode = False
    room = request.args.get("room")
    user = current_user()
    name = user.username if user else session.get('name', 'Player')
    return render_template("ball.html",multi=multi,ai_mode=ai_mode ,room=room, name=name)

@app.route("/ai")
def ai():
    ai_mode = True
    user = current_user()
    name = user.username if user else session.get('name', 'Player')
    return render_template("ball.html", ai_mode=ai_mode, name=name)

@app.route("/api/register", methods=["POST"])
def api_register():
    username = request.form.get("username") or (request.json and request.json.get("username"))
    email = request.form.get("email") or (request.json and request.json.get("email"))
    password = request.form.get("password") or (request.json and request.json.get("password"))
    # yeh teeno upar ki line username email and password derhi h extract kr rhi h 
    # jisme woh phla try request.form.get se krti h dusra request.json se 
    # yeh teeno kisi bhi ek source se data leke arhi h 
    if not username or not password or not email:
        # agaar usernamme nhi h ya pasword nhi h ya email toh yeh return krdo
        # Agar user ne username, password ya email nahi dala,
        # Server turant error JSON bhejega + 400 status code, aur aage ka registration ka code run nahi hoga.
        return jsonify({"ok": False, "error": "username, email and password required"}), 400
    username = username.strip()
    if User.query.filter_by(username=username).first():
        # apne jo username daala h voh chek bhi toh hoga 
        # ki yeh username aap rkh skte ho ya nhi 
        return jsonify({"ok": False, "error": "username taken"}), 400
    if User.query.filter_by(email=email).first():
        # same for email chekc krenge and return krenge 
        return jsonify({"ok": False, "error": "email already used"}), 400

    pw_hash = generate_password_hash(password)
    # password ko safe format me convert krna jisse database me sotre hojaaye 
    # ek werkzeug library h  hash me convert krdega one time encryption h password wapsi nhi laskte h 
    u = User(username=username, email=email, password_hash=pw_hash)
    # ab hum apne database me yeh sb add kar rhe honge
    db.session.add(u)
    # session ko add kro and then commit kro 
    db.session.commit()

    session['user_id'] = u.id # session me bhi add krdenge 
    return jsonify({"ok": True, "user": u.to_dict()})

@app.route("/api/login", methods=["POST"])
def api_login():
    username = request.form.get("username") or (request.json and request.json.get("username"))
    password = request.form.get("password") or (request.json and request.json.get("password"))
    # ab koi login krne aaya h toh phle saari chije mngwalete h 
    if not username or not password:
        # agar dono me se kuch bhi missing h toh 
        # yhi se aap alag alag kar paaoge
        return jsonify({"ok": False, "error": "username & password required"}), 400
    u = User.query.filter_by(username=username).first()
    # username=usernmaeeee krke yeh search krega 
    if not u or not check_password_hash(u.password_hash, password):
        # ab hum check kr rhe hote h ki if not u kya username nhi h or chekc pasword hash ek inbuilt fucniton jo ek trf toh db se pasword lega or ek trf huamra fomr wala or check karega ki kya yeh sb hoskta h 
        return jsonify({"ok": False, "error": "invalid credentials"}), 401
    session['user_id'] = u.id
    # jb tk session valid h yeh yaad rkhega 
    return jsonify({"ok": True, "user": u.to_dict()})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.pop('user_id', None)
    session.pop('room', None)
    session.pop('name', None)
    # teeno chij nikaldo session se 
    return jsonify({"ok": True})

@app.route("/api/auth")
# yeh /api/auth pe jb request aayegi toh yeh function chlega 
def api_auth():
    u = current_user()
#     u = User(
#   id=1,
#   username="meet123",
#   password_hash="xyz...",
#   name="Meet"
# )
# toh yeh line madad krenge current_user() krke usko ek varaible me store krenge
    if not u:
        return jsonify({"ok": False, "user": None})
    # agar u nhi ata none ata h toh yeh return hoga nhi toh 
    # niche wala return hoga 
    return jsonify({"ok": True, "user": u.to_dict()})

@app.route("/api/match_result", methods=["POST"])
def api_match_result():
    """Record match result and award trophies"""
    user = current_user()
    if not user:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    
    data = request.json or {}
    result = data.get("result")  # "win" or "loss"
    
    if result not in ["win", "loss"]:
        return jsonify({"ok": False, "error": "Invalid result"}), 400
    
    # Update match stats
    user.total_matches += 1
    
    if result == "win":
        user.match_wins += 1
        user.trophies += 2  # Award 2 trophies for win
    else:
        # Loss: lose 1 trophy (but never go below 0)
        user.trophies = max(0, user.trophies - 1)
    
    db.session.commit()
    
    return jsonify({
        "ok": True,
        "user": user.to_dict()
    })

@app.route("/api/match_resign", methods=["POST"])
def api_match_resign():
    """
    Handle resignation match result with special trophy logic:
    - Winner: Gets 1 trophy if they have 0, otherwise gets same amount as current trophies
    - Loser: Gets nothing (no penalty)
    - Both: total_matches += 1
    - Neither: match_wins increment (treated as draw/unfair)
    """
    user = current_user()
    if not user:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    
    data = request.json or {}
    is_winner = data.get("is_winner", False)  # True if this user won by opponent resignation
    
    # Update match stats (both players get match count)
    user.total_matches += 1
    
    if is_winner:
        # Winner gets trophy based on special logic
        if user.trophies == 0:
            user.trophies = 1  # Give 1 trophy if they have none
        else:
            user.trophies += user.trophies  # Double their trophies (give same amount)
        # Do NOT increment match_wins (treated as unfair/draw)
    else:
        # Loser gets nothing (no penalty, no trophy loss)
        pass
    
    db.session.commit()
    
    return jsonify({
        "ok": True,
        "user": user.to_dict()
    })

@app.route("/api/leaderboard")
def api_leaderboard():
    """Get paginated leaderboard sorted by match wins"""
    page = request.args.get("page", 1, type=int)
    per_page = 10
    
    # Query users sorted by match_wins (descending), then trophies
    users_query = User.query.order_by(
        User.match_wins.desc(),
        User.trophies.desc()
    )
    
    # Paginate
    pagination = users_query.paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )
    
    leaderboard = []
    for idx, user in enumerate(pagination.items, start=(page - 1) * per_page + 1):
        leaderboard.append({
            "rank": idx,
            "username": user.username,
            "trophies": user.trophies,
            "match_wins": user.match_wins,
            "total_matches": user.total_matches
        })
    
    return jsonify({
        "ok": True,
        "leaderboard": leaderboard,
        "page": page,
        "total_pages": pagination.pages,
        "total_users": pagination.total
    })


@socketio.on("join_room")
def handle_join_room(data):
    room = data.get("room")
    name = data.get("name", "Player")

    if not room:
        emit("room_error", {"error": "Missing room"}, to=request.sid)
        return

    try:
        if room not in room_members:
            room_members[room] = {}

        # occupancy check (live)
        if len(room_members[room]) >= 2:
            emit("room_error", {"error": "Room is full"}, to=request.sid)
            return

        fs_join_room(room)

        # assign player position
        player_position = "player1" if len(room_members[room]) == 0 else "player2"
        room_members[room][request.sid] = {"name": name, "position": player_position}

        # Persist live count to DB (best-effort)
        try:
            db_room = Room.query.filter_by(code=room).first()
            if db_room:
                db_room.members = len(room_members[room])
                db.session.commit()
        except Exception:
            app.logger.exception("Failed to persist member count on join for room %s", room)
            db.session.rollback()

        # Prepare member list to notify clients
        member_list = [{"name": m["name"], "position": m["position"]}
                       for m in room_members[room].values()]

        # Send personalized join info to each player
        for sid, info in room_members[room].items():
            you_name = info["name"]
            opponent_name = None
            for other_sid, other_info in room_members[room].items():
                if other_sid != sid:
                    opponent_name = other_info["name"]
                    break

            emit("room_joined", {
                "room": room,
                "position": info["position"],
                "playerCount": len(room_members[room]),
                "you": you_name,
                "opponent": opponent_name,
                "members": member_list
            }, to=sid)

        # Broadcast room_update for the room
        emit("room_update", {
            "room": room,
            "members": member_list,
            "playerCount": len(member_list)
        }, room=room)

    except Exception as e:
        app.logger.exception("join_room failed")
        emit("room_error", {"error": "Failed to join room"}, to=request.sid)

@socketio.on("disconnect")
def handle_disconnect():
    # Remove player from all rooms
    for room_code, members in list(room_members.items()):
        if request.sid in members:
            try:
                # Get disconnecting player info before removing
                disconnecting_player = members[request.sid]
                disconnecting_position = disconnecting_player.get("position")
                
                # remove from in-memory
                del members[request.sid]
                fs_leave_room(room_code)

                # If there's still 1 player left AND game was active, handle resignation logic
                if len(members) == 1 and room_code in active_games:
                    # Get remaining player (winner)
                    remaining_sid = list(members.keys())[0]
                    remaining_player = members[remaining_sid]
                    
                    # Try to get user IDs from session or database
                    db_room = Room.query.filter_by(code=room_code).first()
                    if db_room and db_room.owner_id:
                        # Determine winner and loser user IDs
                        # This is a best-effort approach; ideally track user_id per sid
                        try:
                            # Get both players' user objects (if logged in)
                            # For now, we'll emit event to client to handle trophy update
                            emit("player_resigned", {
                                "room": room_code,
                                "reason": "disconnect",
                                "winner_position": remaining_player.get("position"),
                                "loser_position": disconnecting_position
                            }, room=room_code)
                        except Exception:
                            app.logger.exception("Failed to process resignation for room %s", room_code)
                
                # Clean up active game tracking if room is now empty or has <2 players
                if len(members) < 2:
                    active_games.discard(room_code)

                # Persist updated member count to DB; if zero, delete the room row
                try:
                    db_room = Room.query.filter_by(code=room_code).first()
                    if db_room:
                        db_room.members = len(members)
                        if db_room.members <= 0:
                            db.session.delete(db_room)
                            db.session.commit()
                        else:
                            db.session.commit()
                except Exception:
                    app.logger.exception("Failed to persist member count on disconnect for room %s", room_code)
                    db.session.rollback()

                # Notify remaining players or clean up in-memory map
                if members:
                    member_list = [{"name": m["name"], "position": m["position"]} for m in members.values()]
                    emit("room_update", {
                        "room": room_code,
                        "members": member_list,
                        "playerCount": len(members)
                    }, room=room_code)
                else:
                    # no members left in-memory: remove key
                    room_members.pop(room_code, None)

            except Exception:
                app.logger.exception("Error handling disconnect for room %s", room_code)

@socketio.on("player_spawn")
def handle_player_spawn(data):
    room = data.get("room")
    if not room or room not in room_members:
        return

    # Flip role for the receiver (other client)
    opp_or_not = data.get("opp_or_not", "our")
    flipped_role = "opp" if opp_or_not == "our" else "our"

    # Build payload to forward. Do NOT modify coordinates here.
    payload = {
        "type": data.get("type"),
        "position": data.get("position"),
        "opp_or_not": flipped_role
    }

    # Prefer normalized coords if sender provided them
    if data.get("nx") is not None and data.get("ny") is not None:
        payload["nx"] = data.get("nx")
        payload["ny"] = data.get("ny")
        # optional: forward playersize for verification
        payload["playersize"] = data.get("playersize", 120)
    else:
        # backward compatibility: forward raw x/y if provided
        payload["x"] = data.get("x")
        payload["y"] = data.get("y")
        payload["playersize"] = data.get("playersize", 120)

    # forward to everyone in room except sender
    emit("opponent_spawn", payload, room=room, skip_sid=request.sid)


@socketio.on("sync_timer")
def handle_sync_timer(data):
    room = data.get("room")
    if not room:
        return
    
    # Broadcast timer to all players in room
    emit("timer_update", {
        "absolutecounter": data.get("absolutecounter")
    }, room=room, include_self=False)

# New: start game handler – broadcasts to entire room
@socketio.on("game_start")
def handle_game_start(data):
    room = (data or {}).get("room")
    if not room:
        emit("room_error", {"error": "Missing room"}, to=request.sid)
        return
    # Validate room exists and has exactly 2 players ready
    members = room_members.get(room)
    if not members:
        emit("room_error", {"error": "Room not found"}, to=request.sid)
        return
    if len(members) < 2:
        emit("room_error", {"error": "Need 2 players to start"}, to=request.sid)
        return
    # Optionally: enforce owner-only start by comparing current user to Room.owner_id
    # Skipped for now due to lack of user<->sid mapping; client UI already hints owner-only.

    # Mark this room as having an active game
    active_games.add(room)
    
    # Broadcast start signal so clients can redirect to /multi
    emit("game_start", {"room": room}, room=room)

# New: chat message handler for in-game chat
@socketio.on("chat_message")
def handle_chat_message(data):
    room = (data or {}).get("room")
    text = (data or {}).get("text", "").strip()
    
    if not room or not text:
        return
    
    # Validate room exists
    if room not in room_members:
        return
    
    # Get sender info (optional: could use session or room_members to get name)
    sender_sid = request.sid
    sender_info = room_members[room].get(sender_sid, {})
    sender_name = sender_info.get("name", "Player")
    
    # Broadcast message to other player(s) in room (skip sender)
    emit("chat_message", {
        "sender": sender_name,
        "text": text
    }, room=room, skip_sid=sender_sid)

# New: explicit player resignation handler
@socketio.on("player_resign")
def handle_player_resign(data):
    """Handle explicit player resignation (e.g., clicking Exit button during game)"""
    room = (data or {}).get("room")
    
    if not room or room not in room_members:
        return
    
    # Get resigning player info
    resigning_sid = request.sid
    resigning_player = room_members[room].get(resigning_sid, {})
    resigning_position = resigning_player.get("position")
    
    # Find opponent (winner)
    winner_sid = None
    winner_player = None
    for sid, player_info in room_members[room].items():
        if sid != resigning_sid:
            winner_sid = sid
            winner_player = player_info
            break
    
    if not winner_player:
        return  # No opponent found
    
    # Emit resignation event to both players
    emit("player_resigned", {
        "room": room,
        "reason": "resign",
        "winner_position": winner_player.get("position"),
        "loser_position": resigning_position
    }, room=room)

# Socket events

@app.route("/api/room/info")
def api_room_info():
    """Return room info including privacy and owner"""
    code = request.args.get("code")
    if not code:
        return jsonify({"ok": False, "error": "Missing room code"}), 400
    
    room = Room.query.filter_by(code=code).first()
    if not room:
        return jsonify({"ok": False, "error": "Room not found"}), 404
    
    return jsonify({"ok": True, "room": room.to_dict()})


@app.route("/api/room/privacy", methods=["POST"])
def api_room_privacy():
    """Toggle room privacy (owner only)"""
    user = current_user()
    if not user:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    
    data = request.json or {}
    code = data.get("code")
    is_private = data.get("is_private")

    if code is None or is_private is None:
        return jsonify({"ok": False, "error": "Missing data"}), 400

    room = Room.query.filter_by(code=code).first()
    if not room:
        return jsonify({"ok": False, "error": "Room not found"}), 404

    if room.owner_id != user.id:
        return jsonify({"ok": False, "error": "Only owner can change privacy"}), 403

    room.is_private = bool(is_private)
    db.session.commit()
    return jsonify({"ok": True, "room": room.to_dict()})

# ---------------------------
# Add: API to list public rooms
# ---------------------------
@app.route("/api/rooms", methods=["GET"])
def api_rooms_list():
    """
    Return list of public rooms with live member counts and owner username.
    Also prune (delete) public rooms that have zero live members.
    """
    rooms = Room.query.filter_by(is_private=False).order_by(Room.created_at.desc()).all()
    out = []

    for r in rooms:
        # live member count from in-memory room_members (primary source)
        live_count = len(room_members.get(r.code, {}))

        # If we detect 0 live members, delete the DB record (prune) and continue
        if live_count < 1:
            try:
                # Double-check and remove persistent entry
                db_room = Room.query.filter_by(code=r.code).first()
                if db_room:
                    db.session.delete(db_room)
                    db.session.commit()
                    # also remove any leftover in-memory mapping (just in case)
                    room_members.pop(r.code, None)
            except Exception:
                app.logger.exception("Failed pruning empty room: %s", r.code)
                db.session.rollback()
            # skip adding to output
            continue

        # Owner lookup
        owner = User.query.get(r.owner_id) if r.owner_id else None

        out.append({
            "code": r.code,
            "owner_username": owner.username if owner else "—",
            "members": live_count,
            "max_members": 2,
            "created_at": r.created_at.isoformat(),
        })

    return jsonify({"ok": True, "rooms": out})


# ---------------------------
# Add: API endpoint to join a room (AJAX)
# ---------------------------
@app.route("/api/room/join", methods=["POST"])
def api_room_join():
    """
    Join a room by code (AJAX). Validates and sets session, returns a JSON redirect hint.
    Requires login (consistent with the rest of the app).
    """
    user = current_user()
    if not user:
        return jsonify({"ok": False, "error": "Not logged in"}), 401

    data = request.json or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or user.username).strip()

    if not code:
        return jsonify({"ok": False, "error": "Missing room code"}), 400

    db_room = Room.query.filter_by(code=code).first()
    if not db_room:
        return jsonify({"ok": False, "error": "Room not found"}), 404

    # If private, only owner can join (same rule as form-based join earlier)
    if db_room.is_private and db_room.owner_id != user.id:
        return jsonify({"ok": False, "error": "Room is private"}), 403

    # live occupancy check using in-memory room_members
    live_count = len(room_members.get(code, {}))
    if live_count >= 2:
        return jsonify({"ok": False, "error": "Room is full"}), 400

    # set session values and return success -> client will redirect to /room
    session["room"] = code
    session["name"] = name
    return jsonify({"ok": True, "redirect": url_for("room_page")})



# ---------------------------
# Health check endpoint
# ---------------------------
@app.route("/health")
def health():
    started = app.config.get('APP_START_TIME')
    uptime_seconds = (time.time() - started) if started else None

    # Package versions (best-effort)
    versions = {}
    try:
        import flask as _flask
        versions['flask'] = getattr(_flask, '__version__', 'unknown')
    except Exception:
        versions['flask'] = 'unavailable'
    try:
        import flask_socketio as _fsio
        versions['flask_socketio'] = getattr(_fsio, '__version__', 'unknown')
    except Exception:
        versions['flask_socketio'] = 'unavailable'
    try:
        import socketio as _socketio
        versions['python_socketio'] = getattr(_socketio, '__version__', 'unknown')
    except Exception:
        versions['python_socketio'] = 'unavailable'
    try:
        import engineio as _engineio
        versions['python_engineio'] = getattr(_engineio, '__version__', 'unknown')
    except Exception:
        versions['python_engineio'] = 'unavailable'
    try:
        import sqlalchemy as _sa
        versions['sqlalchemy'] = getattr(_sa, '__version__', 'unknown')
    except Exception:
        versions['sqlalchemy'] = 'unavailable'

    # Database check
    db_ok = True
    db_error = None
    try:
        db.session.execute(sa_text("SELECT 1"))
    except Exception as e:
        db_ok = False
        db_error = str(e)

    # In-memory/live stats
    try:
        total_db_users = User.query.count()
    except Exception:
        total_db_users = None
    try:
        total_db_rooms = Room.query.count()
    except Exception:
        total_db_rooms = None

    live_rooms = len(room_members)
    live_room_members = {code: len(members) for code, members in room_members.items()}
    live_active_games = len(active_games)

    return jsonify({
        "ok": db_ok,
        "status": "ok" if db_ok else "degraded",
        "python": sys.version.split(" ")[0],
        "platform": platform.platform(),
        "versions": versions,
        "db": {
            "ok": db_ok,
            "error": db_error,
            "users": total_db_users,
            "rooms": total_db_rooms
        },
        "live": {
            "live_rooms": live_rooms,
            "live_room_members": live_room_members,
            "active_games": live_active_games
        },
        "uptime_seconds": uptime_seconds
    })


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    
    socketio.run(app, debug=True)
