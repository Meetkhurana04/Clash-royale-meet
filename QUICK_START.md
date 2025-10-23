# Quick Start Guide - Clash Royale Multiplayer

## Setup & Run

### 1. Initialize Database
```bash
# First time only - create database tables
python app.py
# Visit: http://localhost:5000/initdb
```

### 2. Start Server
```bash
python app.py
```
Server runs on `http://localhost:5000`

### 3. Create Account
1. Open browser → `http://localhost:5000`
2. Click "Social" tab (bottom navigation)
3. Click "Register" tab
4. Fill in username, email, password
5. Click "Create Account"

### 4. Play Multiplayer

#### Player 1:
1. Login to your account
2. Click "Battle" tab
3. Click "Play Online (room)"
4. Enter your name
5. Click "Create Room"
6. **Share the 4-letter room code** with Player 2

#### Player 2:
1. Login to your account (different account)
2. Click "Battle" tab
3. Click "Play Online (room)"
4. Enter your name
5. Enter the room code from Player 1
6. Click "Join Room"

#### Start Game:
- Once both players are in the room, click "Start Game"
- Game will automatically redirect both players
- Play begins!

## Game Controls

### Spawning Units
1. **Drag card** from your deck (bottom)
2. **Drop on canvas** in your territory (bottom half)
3. Unit spawns and moves toward opponent

### Available Units
- **Knight**: 3 elixir, balanced stats
- **Valkyrie**: 3 elixir, fast, area damage
- **P.E.K.K.A**: 5 elixir, high damage, slow
- **Royal Giant**: 5 elixir, ranged, slow

### Elixir System
- **Max**: 10 elixir
- **Regeneration**: ~0.5 per second
- **Cards disabled** when insufficient elixir (grayed out)

### Win Conditions
1. **Destroy opponent's King Tower** = Instant win
2. **Destroy more towers** = Win at time end
3. **Timer**: 3 minutes (180 seconds)

## Game Modes

### 1. Local (Both Sides)
- Control both players
- Test mechanics
- Route: `/ball`

### 2. AI Mode
- Play against bot
- Adjustable difficulty
- Route: `/ai`

### 3. Multiplayer (Online)
- Real-time PvP
- Spawn mirroring
- Timer sync
- Route: `/multi?room=CODE`

## Troubleshooting

### "Room is full"
- Room already has 2 players
- Create a new room or wait

### "Login required"
- Must be logged in to create/join rooms
- Go to Social tab → Login/Register

### Spawns not appearing
- Check browser console (F12)
- Verify Socket.IO connection
- Refresh page and rejoin room

### Timer not syncing
- Player 1 controls timer
- Player 2 follows automatically
- Check console for sync messages

### Canvas too small/large
- Canvas auto-resizes to fit screen
- Maintains 480×720 aspect ratio
- Refresh page if sizing issues

## Tips & Tricks

### Strategy
1. **Elixir management**: Don't overspend early
2. **Counter units**: Use cheap units to defend
3. **Push timing**: Attack when opponent is low on elixir
4. **Tower focus**: Prioritize King Tower for instant win

### Multiplayer
1. **Communication**: Use external chat (Discord, etc.)
2. **Room codes**: Share via text/voice
3. **Stable connection**: Use wired internet if possible
4. **Browser**: Chrome/Firefox recommended

### Performance
1. **Close other tabs**: Reduce browser load
2. **Hardware acceleration**: Enable in browser settings
3. **Zoom**: Keep at 100% for best performance

## Architecture Overview

```
Frontend (Browser)
├── index.html          → Home page, login, room creation
├── room.html           → Lobby, waiting for players
├── ball.html           → Game canvas, socket init
└── game-logic.js       → Game loop, spawns, mirroring

Backend (Flask)
├── app.py              → Routes, Socket.IO handlers
├── SQLite DB           → Users, rooms, sessions
└── Socket.IO           → Real-time communication

Network Flow
Player1 → Socket.IO → Server → Socket.IO → Player2
```

## Development Notes

### Adding New Units
1. Add sprite sheets to `/static/assets/`
2. Update `players` array in `game-logic.js`
3. Add to `attackpower` object with stats
4. Add card images to `ball.html`

### Adjusting Game Balance
Edit `attackpower` in `game-logic.js`:
```javascript
const attackpower = {
  pekka: {
    power: 3,        // Damage per hit
    speed: 2.3,      // Movement speed
    elixir_needed: 5 // Cost
  }
}
```

### Changing Timer
Edit `gametime` in `game-logic.js`:
```javascript
let gametime = 180; // seconds (3 minutes)
```

## Support

### Common Errors

**"Cannot connect to server"**
- Check if Flask server is running
- Verify port 5000 is not blocked
- Try `http://127.0.0.1:5000` instead of `localhost`

**"Database not found"**
- Run `/initdb` route first
- Check if `app.db` exists in project folder

**"Socket.IO not defined"**
- Check CDN link in `ball.html`
- Verify internet connection
- Clear browser cache

### Debug Mode
Enable detailed logging:
```python
# In app.py
socketio.run(app, debug=True, log_output=True)
```

### Browser Console
Press F12 and check:
- Socket connection status
- Spawn events
- Timer sync messages
- Error messages

## Next Steps

1. ✅ **Play local mode** to learn mechanics
2. ✅ **Try AI mode** to practice
3. ✅ **Create account** for multiplayer
4. ✅ **Invite friend** and play online!

Enjoy the game! 🎮👑
