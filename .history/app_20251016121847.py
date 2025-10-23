from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO
import random
from string import ascii_uppercase

app = Flask(__name__)
app.secret_key = "your_secret_key_here"  # Required for sessions
socketio = SocketIO(app)

rooms = {}

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
    ai_mode = True
    return render_template("ball.html",ai_mode )

if __name__ == "__main__":
    socketio.run(app, debug=True)
