from flask import Flask, render_template,request,session,redirect,url_for
from flask_socketio import SocketIO, join_room,leave_room,send
import random
from string import ascii_uppercase

app = Flask(__name__)
socketio = SocketIO(app)

if __name__ == '__main__' :
    socketio.run(app,debug = True)

rooms = {}
def roomcode(len):
    while True:
        code=""
        for _ in range(len):
            code+=random.choice(ascii_uppercase)
        if code not in rooms:
            break
    return code

@app.route("/",methods=["POST","GET"])
def home():
    if request.method == "POST":
        name=request.form.get("name")
        code=request.form.get('code')
        join=request.form.get("join",False)
        create = request.get("create",False)

    if not name:
        return render_template("/",error="please enter a name")
    if join!=False and not code:
        return render_template("/",error="please enter a room code")
    room = code
    if create != False:
        room = roomcode(4)
    return render_template("index.html")

@app.route("/ball")
def ball_page():
    # Only allow access if user came from session
    if "name" not in session or "room" not in session:
        return redirect(url_for("home"))

    return render_template("ball.html")