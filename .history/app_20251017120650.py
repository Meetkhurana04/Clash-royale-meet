from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO
import random
from string import ascii_uppercase
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash


app = Flask(__name__)
app.secret_key = "your_secret_key_here" 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
db = SQLAlchemy(app)
socketio = SocketIO(app)

rooms = {}
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "owner_id": self.owner_id,
            "members": self.members,
            "created_at": self.created_at.isoformat()
        }
def roomcode(length=4):
    while True:
        code = "".join(random.choice(ascii_uppercase) for _ in range(length))
           # ensure unique in DB and not in-memory
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
    # GET -> show index
    if request.method == "GET":
        return render_template("index.html")

    # POST -> create or join a room (form from index.html)
    if request.method == "POST":
        user = current_user()
        if not user:
            return render_template("index.html", error="You must be logged in to create or join rooms.")

        name = request.form.get("name") or user.username
        code = request.form.get("code", "").strip().upper()
        join = request.form.get("join", "")
        create = request.form.get("create", "")

        if not name:
            return render_template("index.html", error="Please enter a name")

        if join and not code:
            return render_template("index.html", error="Please enter a room code to join")

        room_code = code
        if create:
            room_code = roomcode(4)
            # persist room to DB
            new_room = Room(code=room_code, owner_id=user.id, members=0)
            db.session.add(new_room)
            db.session.commit()

        # set session values and redirect to ball page
        session["room"] = room_code
        session["name"] = name
        return redirect(url_for("ball_page"))


@app.route("/room")
def room_page():
    # show the simple room page (room.html). User must be logged in and session must have room/name
    if "room" not in session or "name" not in session:
        return redirect(url_for("home"))
    room_code = session["room"]
    name = session["name"]
    return render_template("room.html", room=room_code, name=name)


@app.route("/ball")
def ball_page():
    # if "name" not in session or "room" not in session:
    #     return redirect(url_for("home"))
    ai_mode = False
    return render_template("ball.html",ai_mode=ai_mode )
@app.route("/ai")
def ai():
    # if "name" not in session or "room" not in session:
    #     return redirect(url_for("home"))
    ai_mode = True
    return render_template("ball.html",ai_mode=ai_mode )

if __name__ == "__main__":
    socketio.run(app, debug=True)
