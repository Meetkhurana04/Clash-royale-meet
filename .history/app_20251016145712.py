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
def roomcode(length):
    while True:
        code = "".join(random.choice(ascii_uppercase) for _ in range(length))
        if code not in rooms:
            return code

@app.route("/", methods=["GET", "POST"])
def home():
    if request.method == "POST":
        name = request.form.get("name")
        code = request.form.get("code")
        join = request.form.get("join", False)
        create = request.form.get("create", False)

        if not name:
            return render_template("index.html", error="Please enter a name")

        if join and not code:
            return render_template("index.html", error="Please enter a room code")

        room = code
        if create:
            room = roomcode(4)
            rooms[room] = {"members": 0}

        session["room"] = room
        session["name"] = name
        return redirect(url_for("ball_page"))

    return render_template("index.html")

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
