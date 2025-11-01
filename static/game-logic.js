// background image
const bgimage = document.getElementById('bg-img');
const bgimage2 = document.getElementById('bg-img2');

let gametime = 180; // 3 minutes
let isDraggingOur = false;
let isDraggingOpp = false;
let currentDragSide = null;
let aiDifficulty = "medium"; 
// minimal globals for game end / auto-clear
window.gameEnded = false;           // set true when the match finishes
window._clearGameTimeout = null;    // handle to auto-clear timer
const AUTO_CLEAR_AFTER_MS = 15000;  // auto-clear after 15 seconds (adjust 10000..20000 as desired)


// Multiplayer variables (initialized from ball.html)
const isMultiplayerMode = typeof multi_mode !== 'undefined' && multi_mode;
const isAiMode = typeof ai_mode !== 'undefined' && ai_mode;
const currentRoom = typeof room_code !== 'undefined' ? room_code : null;
let playerPosition = typeof myPosition !== 'undefined' ? myPosition : null; // 'player1' or 'player2'


//towers

const ourarcher1 = document.getElementById('our-archer1');
const ourarcher0 = document.getElementById('our-archer0');
const opparcher0 = document.getElementById('opp-archer0');
const opparcher1 = document.getElementById('opp-archer1')
const ourking = document.getElementById('our-king');
const oppking = document.getElementById('opp-king');

const crownblue = document.getElementById('crownblue');
const crownred = document.getElementById('crownred');

const cushionblue = document.getElementById('cushionblue');
const cushionred = document.getElementById('cushionred');



// ourdeck
// const ourvalk = document.getElementById('our-valk');
// const ourwiz = document.getElementById('our-wiz');
// const ourpekka = document.getElementById('our-pekka');
// const ourroyal_giant = document.getElementById('our-royal_giant');

//oppdeck
// const oppvalk = document.getElementById('opp-valk');
// const oppwiz = document.getElementById('opp-wiz');
// const opppekka = document.getElementById('opp-pekka');
// const opproyal_giant = document.getElementById('opp-royal_giant');

//ourbar
// const ourbar = document.getElementById('our-bar');
//oppbar
// const oppbar = document.getElementById('opp-bar');



let game_type = isMultiplayerMode ? "multi" : (isAiMode ? "ai" : "local");

// ====================================
// 🔹 Game State Persistence (Save/Restore on Reload)
// ====================================
const GAME_STATE_KEY = `clash_game_state_${currentRoom || 'local'}`;

function saveGameState() {
  // STOP saving once the game has ended
  if (window.gameEnded) return;

  // Save current game state to localStorage
  const state = {
    activeplayers: activeplayers.map(p => ({
      id: p.id,
      type: p.type,
      chrKey: p.chrKey,
      opp: p.opp,
      x: p.x,
      y: p.y,
      dx: p.dx,
      dy: p.dy,
      power: p.power,
      health: p.health,
      maxhealth: p.maxhealth,
      state: p.state,
      // Store current frame index for restoration
      frameType: p.state,
      // For towers
      ...(p.type === 'towers' && {
        w: p.w,
        h: p.h,
        ww: p.ww,
        hh: p.hh,
        xdraw: p.xdraw,
        ydraw: p.ydraw
      })
    })),
    absolutecounter: absolutecounter,
    current_elixiropp: current_elixiropp,
    current_elixirour: current_elixirour,
    timestamp: Date.now(),
    gameEnded: false // Mark as active game
  };
  
  try {
    localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save game state:', e);
  }
}

function restoreGameState() {
  try {
    const saved = localStorage.getItem(GAME_STATE_KEY);
    if (!saved) return false;
    
    const state = JSON.parse(saved);
    
    // Don't restore if game had ended (e.g., resignation)
    if (state.gameEnded === true) {
      console.log('Game state marked as ended - not restoring');
      localStorage.removeItem(GAME_STATE_KEY);
      return false;
    }
    
    // Check if state is too old (more than 10 minutes)
    const age = Date.now() - state.timestamp;
    if (age > 10 * 60 * 1000) {
      localStorage.removeItem(GAME_STATE_KEY);
      return false;
    }
    
    // Restore timer and elixir
    absolutecounter = state.absolutecounter;
    current_elixiropp = state.current_elixiropp;
    current_elixirour = state.current_elixirour;
    
    // Restore activeplayers
    activeplayers = state.activeplayers.map(p => {
      const restored = {
        id: p.id,
        type: p.type,
        opp: p.opp,
        x: p.x,
        y: p.y,
        dx: p.dx,
        dy: p.dy,
        power: p.power,
        health: p.health,
        maxhealth: p.maxhealth,
        state: p.state
      };
      
      // Restore frame reference
      if (p.type === 'towers') {
        // For towers, restore the image reference
        let imageRef;
        if (p.id.includes('opparcher0')) imageRef = opparcher0;
        else if (p.id.includes('opparcher1')) imageRef = opparcher1;
        else if (p.id.includes('ourarcher0')) imageRef = ourarcher0;
        else if (p.id.includes('ourarcher1')) imageRef = ourarcher1;
        else if (p.id.includes('oppking')) imageRef = oppking;
        else if (p.id.includes('ourking')) imageRef = ourking;
        
        restored.type = 'towers';
        restored.w = p.w;
        restored.h = p.h;
        restored.ww = p.ww;
        restored.hh = p.hh;
        restored.xdraw = p.xdraw;
        restored.ydraw = p.ydraw;
        restored.currentFrame = imageRef;
      } else {
        // For regular units, restore animation frame
        restored.chrKey = p.chrKey;
        restored.currentFrame = royals[p.chrKey][p.state];
      }
      
      return restored;
    });
    
    console.log('Game state restored:', activeplayers.length, 'players');
    return true;
  } catch (e) {
    console.error('Failed to restore game state:', e);
    localStorage.removeItem(GAME_STATE_KEY);
    return false;
  }
}

function clearGameState() {
  localStorage.removeItem(GAME_STATE_KEY);
}

// Save state periodically during game
let saveStateInterval = null;

// Warn before reload/close
window.addEventListener('beforeunload', (e) => {
  // Only warn / save if game still active and user hasn't left
  if (!window.gameEnded && absolutecounter > 0 && activeplayers.length > 0) {
    saveGameState();
    e.preventDefault();
    e.returnValue = ''; // show generic message in modern browsers
  } else {
    // no prompt; allow navigation (and no save)
  }
});

function leaveGameImmediate() {
  // Mark left so autosaves stop
  window.gameEnded = true;

  // Cancel any scheduled auto-clear (if set)
  if (window._clearGameTimeout) {
    clearTimeout(window._clearGameTimeout);
    window._clearGameTimeout = null;
  }

  // Stop any periodic save interval (if you have one)
  if (typeof saveStateInterval !== 'undefined' && saveStateInterval !== null) {
    clearInterval(saveStateInterval);
    saveStateInterval = null;
  }

  // Clear saved state so next session starts fresh
  try { clearGameState(); } catch (e) { console.warn('clearGameState failed', e); }

  // If multiplayer socket exists, politely leave / disconnect
  try {
    if (typeof socket !== 'undefined' && socket) {
      // optional: tell server you're leaving the room
      if (typeof currentRoom !== 'undefined' && currentRoom) {
        socket.emit('leave_room', { room: currentRoom });
      }
      // fully disconnect local socket to avoid incoming syncs
      if (typeof socket.disconnect === 'function') socket.disconnect();
    }
  } catch (e) { console.warn('socket leave error', e); }

  // Redirect to homepage (adjust URL if you want a different location)
  window.location.href = '/';
}

function createExitButton() {
  if (document.getElementById('exitToHomeBtn')) return; // already created

  const btn = document.createElement('button');
  btn.id = 'exitToHomeBtn';
  btn.textContent = 'Exit';
  Object.assign(btn.style, {
    position: 'fixed',
    right: '12px',
    top: '12px',
    padding: '8px 12px',
    background: 'rgba(255,215,0,0.95)',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '700',
    zIndex: 999999,
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(0,0,0,0.3)'
  });

  btn.title = 'Leave match and return to home (clears saved state)';
  btn.addEventListener('click', () => {
    // small confirm is optional — remove confirm() if you want no prompt
    const ok = confirm('Leave match now and discard saved state?');
    if (!ok) return;
    leaveGameImmediate();
  });

  document.body.appendChild(btn);
}



let players = ["chr_pekka_out","chr_knight_out","chr_valkyrie_out","chr_royal_giant_out"]
// Node structure
let sprite = ['chr_pekka_sprite_','chr_knight_sprite_','chr_valkyrie_sprite_','chr_royal_giant_sprite_']
class Node {
    //sprite = players + spritee
  constructor(num,baseURL,sprite) {
    this.num = pad(num);
    this.img = new Image();
    // this.img.src = `${baseURL}chr_pekka_sprite_${num}.png`;
    this.img.src = `${baseURL}${sprite}${this.num}.png`
    this.next = null;
  }
}
let royals = { 
    chr_pekka_out: {},
    chr_knight_out: {},
    chr_valkyrie_out: {},
    chr_royal_giant_out: {}

}
function pad(num, size = 3) {
  return num.toString().padStart(size, "0");
}


//spritesheet.chr_pekka_out
// direct key ka naam
// if varaible ka derhe hote h oth [] 
// yhi se hum niche ke loop me spritesheet ke coordinates uthayenge 
const spritesheet ={
    chr_pekka_out : {
        walk:[125,112],//
        walkopp:[150, 140],//
        attack:[320,310],//
        attackopp:[350,340],//
    },
    chr_knight_out : {
        walk:[107,97],//
        walkopp:[11,1 ], //
        attack:[484,460], //
        // attack:[371,360], //

        attackopp:[371,360] //
    },
     chr_valkyrie_out: {
        walk:[71,64], // 
        walkopp:[88,81],//
        attack:[378,358], //
        attackopp:[174,164]//
    },
      chr_royal_giant_out: {
        walk:[143,128],//
        walkopp:[15,1],//
        attack:[251,243],
        attackopp:[174,166]
    }
}

const cardIdopp = [
  "opp-knight", "opp-valk", "opp-pekka", "opp-royal_giant"
];

// hog rider 1 se 7 h oppwalk
const moves = ['walk','walkopp','attack','attackopp'];
function move(startsprite, endsprite){
for ( let i = 0 ; i < players.length ; i++ ){
    // selecting player
    // har player ke liye link list bn rhi h
const baseURL = `https://raw.githubusercontent.com/smlbiobot/cr-assets-png/master/assets/sc/${players[i]}/`;
for(let k = 0;k<moves.length;k++) {
    // selcting hum kiske liye h like walk , attack 
let head = null, prev = null;
  // har link list me particular spritesheet map kar rhe h 
  // mapping sprtieseet with that action 
  for (let j = spritesheet[players[i]][moves[k]][0]; j >= spritesheet[players[i]][moves[k]][1]; j--) {
    const node = new Node(j,baseURL,sprite[i]);
    if (!head) head = node;
    if (prev) prev.next = node;
    prev = node;

  }
  prev.next = head; // make it circular
  royals[players[i]][moves[k]]=head;
  
}
}
// sbke sprite sheet load krke ek royals naam ke objetct me derha h jisme ki saare action define h 
// royals.chr_pekka_out.walk aise krke hum sprite sheet ko access kar rhe hogne

}
move();



const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
// Improve mobile interactions
canvas.style.touchAction = 'none';

// Canvas responsive sizing
function resizeCanvas() {
  const wrapper = document.getElementById('game-wrapper');
  if (!wrapper) return;
  
  const aspectRatio = 480 / 720; // width / height
  const maxWidth = Math.min(window.innerWidth - 40, 480);
  const maxHeight = Math.min(window.innerHeight - 40, 720);
  
  let newWidth, newHeight;
  
  if (maxWidth / maxHeight > aspectRatio) {
    // Height is the constraint
    newHeight = maxHeight;
    newWidth = newHeight * aspectRatio;
  } else {
    // Width is the constraint
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }
  
  // Update wrapper size (CSS pixels)
  wrapper.style.width = newWidth + 'px';
  wrapper.style.height = newHeight + 'px';
  wrapper.style.margin = '20px auto';
  
  // Canvas internal resolution stays fixed at 480x720
  // This ensures consistent game coordinates
}

// Call on load and resize
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);
window.addEventListener('load', initTouchDrag);


const oppspawn = {
  rX:75+20,
  rY:60+100,
  lX:330+20,
  lY:60+100
}

const ourspawn = {
  rX:60+30,
  rY:330+70,
  lX:330+20,
  lY:330+70
}

const playersize = 120 ;

// hum animate me ek chr value derhe honge 
// chr me kya define hoga chr me hum name derhonge vlakyrie royal_giant jiska naam denge uske do amne samne 
// ke aajaayegen ladneee 

// humne class bnali h sbki pekka wgehra ki ab hum chahte h ki hum peeka. krke hi access krwarhe hogne woh
// woh bhi object bnake 

// function animate(chr) {
//   ctx.clearRect(0, 0, canvas.width, canvas.height);

  
//   if (royals[`chr_${chr}_out`].walk.img.complete) {
//     ctx.drawImage(royals[`chr_${chr}_out`].walk.img, ourspawn.rX, ourspawn.rY, 128, 128);
//     ctx.drawImage(royals[`chr_${chr}_out`].walkopp.img, oppspawn.rX, oppspawn.rY, 128, 128);
   


//     // ourspawn.rX-=pekka.dx;
    
//   }
//   if(ourspawn.rY<oppspawn.rY+55){
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     attack(chr)
//   }
//   else{
//     ourspawn.rY-=p1.dy;
//     oppspawn.rY+=p1.dy;
//     // oppspawn.ry+=valkyrie.dy;
//   }
  
//   royals[`chr_${chr}_out`].walk = royals[`chr_${chr}_out`].walk.next;
//   royals[`chr_${chr}_out`].walkopp = royals[`chr_${chr}_out`].walkopp.next; // move to next frame

//   setTimeout(() => requestAnimationFrame(() => animate(chr)), 100);
// }
// console.log(pekka_move.our_pekka_walk.img);
// pekka_move.our_pekka_walk.img.onload = () => animate();
// animate('pekka');
// animate('valkyrie');
// animate(`valkyrie`);

// setTimeout(() => animate('valkyrie'),3000);

// let our_pekk = move(pekka.attack[0],pekka.attack[1]);
// let opp_pekka = move(pekka.attackopp[0],pekka.attackopp[1]);
// function attack(chr){
  

//   ctx.drawImage(royals[`chr_${chr}_out`].attack.img, ourspawn.rX, ourspawn.rY, 128, 128);
//   ctx.drawImage(royals[`chr_${chr}_out`].attackopp.img, oppspawn.rX, oppspawn.rY, 128, 128);

//   royals[`chr_${chr}_out`].attack= royals[`chr_${chr}_out`].attack.next;
//   royals[`chr_${chr}_out`].attackopp = royals[`chr_${chr}_out`].attackopp.next; 

//   // requestAnimationFrame(attack)
// }
let activeplayers = []

function makeActive(type, x, y, opp_or_not, fromNetwork = false) {
  const chrKey = `chr_${type.toLowerCase()}_out`;
  const stats = attackpower[type.toLowerCase()]; // e.g. attackpower["pekka"]
  if (!stats) {
    console.error(`Invalid type: ${type}`);
    return; // Skip invalid player
  } // e.g. attackpower["pekka"]
  
  // Only deduct elixir if this is a local spawn (not from network)
  if (!fromNetwork) {
    let elixir_req = stats.elixir_needed;
    if(opp_or_not === 'opp' ){
      current_elixiropp-=elixir_req;
    }
    if(opp_or_not === 'our'){
      current_elixirour-=elixir_req;
    }
  }
// yeh toh minus krne ka likh liya h ab hume likhan hki draggable rhe iske liye gameloop m ehi fucniton call likhna pdega jo 
// jo persecond undraggable krta rhe 
  activeplayers.push({
    id: `${type}_${Date.now()}`,  // unique
    type: type.toLowerCase(),     // to lookup royals[] animations
    chrKey : chrKey,
    opp : opp_or_not,
    x: x,
    y: y,
    dx: stats.speed,
    dy: stats.speed,
    power: stats.power,
    health: 100,
    maxhealth : 100,
    state: "walk",
    currentFrame: royals[chrKey].walk,
    fromNetwork: fromNetwork
    //  currentFrame: royals["chr_pekka_out"].walk  
  });
  
  // Emit spawn to other player in multiplayer mode
// inside makeActive, after pushing locally
// inside makeActive, when emitting (replace your emit block)
if (isMultiplayerMode && !fromNetwork && typeof socket !== 'undefined' && socket && currentRoom) {
  // compute center in canvas pixels
  const centerX = Math.round(x + playersize / 2);
  const centerY = Math.round(y + playersize / 2);

  // NORMALIZE (0..1)
  const normX = centerX / canvas.width;   // float 0..1
  const normY = centerY / canvas.height;  // float 0..1

  socket.emit('player_spawn', {
    room: currentRoom,
    type: type,
    // send normalized center coords
    nx: normX,
    ny: normY,
    opp_or_not: opp_or_not,
    position: playerPosition,
    playersize: playersize
  });

 // console.log('EMIT spawn norm', { normX, normY, centerX, centerY, playersize });
}




konseactivehongeplayer(current_elixiropp, current_elixirour);
// spawn hone ke baad bhi toh update krna chaiye kyuki us tiem km hua h 


}

//   const cardIds = [
//     "our-knight", "our-valk", "our-pekka", "our-royal_giant",
//     "opp-knight", "opp-valk", "opp-pekka", "opp-royal_giant"
//   ];

//   cardIds.forEach(id => {
//     const card = document.getElementById(id);
//     if (!card) return;

//     // draggable set karo
//     card.draggable = enabled;

//     // agar disabled hai to grey filter lagao, warna normal
//     if (!enabled) {
//       card.style.filter = "grayscale(100%) brightness(60%)";
//       card.style.cursor = "not-allowed";
//     } else {
//       card.style.filter = "none";
//       card.style.cursor = "grab";
//     }
//   });
// }

let max_elixir = 10;
let current_elixiropp = 10;
let current_elixirour = 10;


function drawElixirBar(ctx, x, y, width, height, fillPercent) {
  // fillPercent: 0 to 1 (how full the bar is)
  const fillWidth = width * fillPercent;
  

  // Create linear gradient (left → right)
  const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);

  // Colors inspired by Clash Royale elixir bar
  gradient.addColorStop(0, "#d86eff");  // light pinkish purple
  gradient.addColorStop(0.5, "#b200ff"); // rich purple mid
  gradient.addColorStop(1, "#6e00b3");   // dark violet edge

  // Draw background bar (grayish)
  ctx.fillStyle = "#222"; 
  ctx.fillRect(x, y, width, height);

  // Draw glowing elixir fill
  ctx.fillStyle = gradient;
  ctx.shadowColor = "#b200ff";
  ctx.shadowBlur = 15; // glow
  ctx.fillRect(x, y, fillWidth, height);

  // Reset shadow
  ctx.shadowBlur = 0;

  // Optional border
  // ctx.strokeStyle = "#000";
  // ctx.lineWidth = 2;
  // ctx.strokeRect(x, y, width, height);

  const elixirText = `${Math.round(fillPercent * 100) / 10} / 10`; 
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#b200ff";
  ctx.shadowBlur = 10;
  ctx.fillText(elixirText, x + width / 2, (y + height / 2) + 2);

  // Reset shadow
  ctx.shadowBlur = 0;

}

// let leftCounter = 0;  // minutes
// let rightCounter = 0; // seconds
// let absolutecounter = 0;

let absolutecounter = gametime;
let isTimerSynced = false;
let lastTimerSync = 0;


// math,floor always round down math.round nearest integer pe krta h ,, math.trunc just decimal values ko htata h decide nhi krta h 


function timer(min, sec) {
  // yeh saara visullay bdiya kr rha h game ko 
  ctx.clearRect(30, 16, 100, 50);

  // Background box (your coordinates)
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.roundRect(30, 16, 100, 50, 10);
  ctx.fill();
  ctx.stroke();

  // "Time left:
  ctx.font = "bold 14px Arial";
  ctx.fillStyle = "#ffea77";
  ctx.textAlign = "center";
  ctx.fillText("Time left :", 80, 30);

  // Timer text (dynamic)
  const timeText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  ctx.font = "bold 22px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeText(timeText, 80, 50);
  ctx.fillText(timeText, 80, 50);
}
let flag = true;


// // Define your river boundaries and bridges (already given by you)
// const RIVER_BOUNDARIES = {
//   opp: 280,   // Opponent side edge of river
//   our: 395    // Our side edge of river
// };

// const left_bridge = { x: 55,  topy: 290, bottomy: 290 };
// const right_bridge = { x: 315, topy: 290, bottomy: 395 };



function konseactivehongeplayer(current_elixiropp,current_elixirour){
const cardIdour = [
    "our-knight", "our-valk", "our-pekka", "our-royal_giant", ];
const cardIdopp = [
    "opp-knight", "opp-valk", "opp-pekka", "opp-royal_giant" ];
const cardNameMap = {
  "our-knight": "knight",
  "our-valk": "valkyrie",
  "our-pekka": "pekka",
  "our-royal_giant": "royal_giant",
  "opp-knight": "knight",
  "opp-valk": "valkyrie",
  "opp-pekka": "pekka",
  "opp-royal_giant": "royal_giant"
};

  function updateCard(id, current_elixir) {
    const card = document.getElementById(id);
    if (!card) return;

    const needed = attackpower[cardNameMap[id]].elixir_needed;
    const hasEnough = current_elixir >= needed; // true false derha hoga

    card.draggable = hasEnough;  // Prevent drag if not enough , if false toh undraggable hoga 
    if (!hasEnough) {
      card.style.filter = "grayscale(100%) brightness(60%)";
      card.style.cursor = "not-allowed";
    } else {
      card.style.filter = "none";
      card.style.cursor = "grab";
    }
  }

  // Update our cards
  cardIdour.forEach(id => updateCard(id, current_elixirour));
  // Update opp cards
  cardIdopp.forEach(id => updateCard(id, current_elixiropp));


}


const cardidoppnew = [
  "opp-knight", "opp-valk", "opp-pekka", "opp-royal_giant"
];
function gameloop() {
  // Stop game loop if game has ended (e.g., resignation)
  if (window.gameEnded) {
    console.log('Game loop stopped - game has ended');
    return;
  }

let leftCounter = Math.floor(absolutecounter / 60);  // minutes
let rightCounter = Math.floor(absolutecounter % 60); // seconds

// Sync timer in multiplayer mode (player1 is master)
if (isMultiplayerMode && playerPosition === 'player1' && typeof socket !== 'undefined' && socket && currentRoom) {
  const now = Date.now();
  if (now - lastTimerSync > 1000) { // Sync every second
    socket.emit('sync_timer', {
      room: currentRoom,
      absolutecounter: absolutecounter
    });
    lastTimerSync = now;
  }
}

// if(multi){
//   ctx.drawImage(bgimage,0, 0, canvas.width, canvas.height);
// }


if(isMultiplayerMode){
 const scale = Math.min(canvas.width / bgimage2.width, canvas.height / bgimage2.height);
  const x = (canvas.width - bgimage2.width * scale) / 2;
  const y = (canvas.height - bgimage2.height * scale) / 2;
  ctx.drawImage(bgimage2, x, y, bgimage2.width * scale, bgimage2.height * scale);
}
else{
ctx.drawImage(bgimage,0, 0, canvas.width, canvas.height - 20);
}
drawtowers(activeplayers);
// ctx.fillRect(x, y, w, h) 200 -15 200 630 60




drawElixirBar(ctx, 230, 0, 230, 20, (current_elixiropp/max_elixir));

drawElixirBar(ctx, 230, 653, 230, 28, (current_elixirour/max_elixir));

absolutecounter = Math.max(0, absolutecounter - 0.1);

// Auto-save game state every 2 seconds
if (!window.lastSaveTime) window.lastSaveTime = 0;
const now = Date.now();
if (now - window.lastSaveTime > 2000) {
  saveGameState();
  window.lastSaveTime = now;
}
// rightCounter++; if (rightCounter >= 60) { rightCounter = 0; leftCounter++; } 
const LOOP_MS = 100; // har 0.1 second me loop call hoga
const DELTA = LOOP_MS / 1000; // 0.1 seconds

if (leftCounter > 0 || rightCounter > 0) {
  // Decrement seconds
  rightCounter = rightCounter - DELTA;

  // Agar 0 se neeche chala gaya
  if (rightCounter <= 0) {
    if (leftCounter > 0) {
      leftCounter--;
      rightCounter = 60 + rightCounter; // e.g. -0.1 => 59.9 se resume
    } else {
      rightCounter = 0; // final clamp
    }
  }

  // Round display ke liye (avoid float mess)
  rightCounter = Math.round(rightCounter * 10) / 10;
}
// Show on screen
timer(leftCounter, Math.floor(rightCounter))

// ctx.fillStyle = 'red';        // sets the fill color to red
// ctx.fillRect(500, 300, 200, 200); // draws a solid rectangle

let oppElixirRate = 0.05;
if (ai_mode) {
  switch (aiDifficulty) {
    case "easy": oppElixirRate = 0.05; break;
    case "medium": oppElixirRate = 0.069; break;
    case "hard": oppElixirRate = 0.08; break;   // double regen
    case "extreme": oppElixirRate = 0.09; break; // even faster
  }
}

if (max_elixir > current_elixiropp) {
  current_elixiropp = Math.min(max_elixir, current_elixiropp + oppElixirRate);
}

if (max_elixir > current_elixirour) {
  current_elixirour = Math.min(max_elixir, current_elixirour + 0.05);
}

  // Update card visuals after regen
  konseactivehongeplayer(current_elixiropp, current_elixirour);

  if (isDraggingOur) {
  // Draw drop zone for our side (bottom)
  ctx.fillStyle = "rgba(237, 15, 15, 0.3)";
   // Blue tint for our side
    ctx.fillRect(30, 50, canvas.width - 60, OPP_MAX_Y - 100);
  
  }
  if (isDraggingOpp) {
  // Draw drop zone for opp side (top)
  ctx.fillStyle = "rgba(237, 15, 15, 0.3)"; // Red tint for opp side
  ctx.fillRect(30, OUR_MIN_Y + 84, canvas.width - 50, canvas.height - OUR_MIN_Y - 100);
  
  }

// drawtimer(x , y);

//  ourdeck();
//  oppdeck();
//  drawoppbar();)
//  drawourbar();
opp = {}
our = {} 
// isko har second hi fresh bnana hoga isse kya hoga koi player
// mar jaayega toh uski id toh rhegi or baar baar pop bhi krna overhead h 
// isme kya hoga jo jo chijo acitve players me hogi woh woh chije hi filll horhi hogi 

 for (let player of activeplayers){
  // ek side kar rhe h opp ke players
 if(player.opp === 'opp'){
    opp[player.id] = [player.x,player.y];
   // ek side karr rhe h our ke players 
  }
  else{
    our[player.id]= [player.x,player.y];
 }
}

// if (Object.keys(opp).length === 0) { // Changed from opp.length
    
//     setInterval(() => {
//       alert("you win");
//     }, 3000);
//     return;
//   }

let deadIds = [];
//   if(player.state ==='walkopp'){
//     player.y += player.dy; 
//   }

//     if(player.state === 'walk' ){
//      player.y -= player.dy; 
//     }

// Solution: Split into 2 passes
// Pass 1: opp aur our dict build karo. (sirf info collect karna)
// Pass 2: Har player ke liye uska nearest enemy nikaalo + move karao + draw karao
// const w = canvas.width;
// const h = canvas.height;
// //rectanglee
// // Style
// ctx.fillStyle = "rgba(255, 0, 0, 0.6)"; // red with transparency

// // Rectangle thickness
// const thickness = 2;

// // Horizontal rect (centered horizontally)
// ctx.fillRect(0, h / 2 - thickness / 2, w, thickness);

// // Vertical rect (centered vertically)
// ctx.fillRect(w / 2 - thickness / 2, 0, thickness, h);
//  75, 100, 80 , 100 ,"opp");
// ctx.fillRect(75, 100, 80, 80);
// ctx.fillRect(210, 80, 80, 80);
// ctx.fillRect(345, 100, 80, 80);


// // our side ke 
// ctx.fillRect(75, 540, 80, 80);
// ctx.fillRect(210, 560, 80, 80);
// ctx.fillRect(345, 540, 80, 80);


for (let player of activeplayers){ // responsible for drawing one image of every active players
  if (player.opp === 'opp' && player.state === 'walk') {
  player.state = 'walkopp';
  player.currentFrame = royals[player.chrKey].walkopp;
}
// default toh walk arha hoga
  // yeh har ek activeplayer ki trh chlega toh hume jo nearest find kran hoga 
  // nearest find jo krna hoga woh isplayer vs enemy group krna hoga
  // woh thoda beneficial rhega 
let target = []; // har baar target reset isse kya hoga ki naya target and dynamicness rahe 
//get nearest enemy ab bn gya h crazy fucnitno yeh agar me our ke liye call krugna toh opp dega
// opp ke liye call kru toh our dega
// NEW: Smart targeting (bridge-aware)
if (player.opp === 'opp') 
{ 
  target = getNearestEnemy(player, our); 
} 
else
{ 
  target = getNearestEnemy(player, opp);
} 
if (!target) 
 return null;

  
if(target.dist>target.kitnapass){
   if(player.opp === 'our' && player.state === 'attack'){
  player.state = 'walk';
  player.currentFrame = royals[player.chrKey].walk;

  }
  else if(player.opp === 'opp' && player.state === 'attackopp'){
  player.state = 'walkopp';
  player.currentFrame = royals[player.chrKey].walkopp;
  }
        // X ko adjust karo
      if (player.x < target.x) {

        player.x += player.dx;

      } else if (player.x > target.x) {
        player.x -= player.dx;
      }

      if (player.y < target.y) {
        player.y += player.dy;
      } else if (player.y > target.y) {
        player.y -= player.dy;
      }
}
else{
  // ab x y nhi bdhega ab sirf attack hoga if me wrap krdena
  if (player.opp === 'our' && player.state === 'walk'){
  player.state = 'attack';
  player.currentFrame = royals[player.chrKey].attack;

  }
  else if(player.opp === 'opp' && player.state === 'walkopp'){
  player.state = 'attackopp';
  player.currentFrame = royals[player.chrKey].attackopp;
  }
  let samnewala = activeplayers.find(p => p.id === target.id)
  if (!samnewala) continue; // NEW: Skip if target already gone
  // isme yeh issue h ki multiple players ke liye for loop chl rha h and maanlo 4 player h toh 4 player h inmese kisi ek nhi bhi kill krdiya 
  // toh dikkt hojayegi
  // yeh samenwala kese kaam kr rha ki active player me us target id wala dhund tah but socho player 1 ko yeh find krke milgya h 
  // and usne attackfucntion me bhejidya ab attack fucntion me jaane ke baad woh mar ke ajayega or active player se ht jayega 
  // but abhi bhi woh chij our or opp me h aap soch skte ho apne toh bhot dimag lgake function likha tha nearest ko call krne ka but 
  // but wo nearest me opp or our jarhe h and jo delete horah h voh activeplayers me horha h ; and oppp or our toh upar bhar chuka h 
  // toh yeh chij toh dikkt hogyi na 
  // pura uska object derha h 
  let deadId = attackfunction(player, samnewala);
  if (deadId) {
        deadIds.push(deadId); // NEW: Collect ID instead of filtering
      }
// if (deadId) {
//   activeplayers = activeplayers.filter(p => p.id !== deadId);
// }
  // ya toh ek try lgade ki oppp me h toh our me bhi remove krdo 
  // ya fir opp or our ko htake hum ek arrow function lgade jo opp or our ka kaam khtm krde or direct hi filter krke dede overhead less hojaye
  // 3rd option hoga ek deadid bnai jaaye bahr store ki jaaye and usko filter ki jaaye most optimal but opp or our ka overheas rhte 
  // jo yeh humen teen solution cover kiye woh dekht eh 

  // phle toh yeh ki try lgake remove krdenge woh bhi sahi h but woh chij activeplayerse remove nhi hogi toh active player bhi 
  // gameloop me rhega iska mtlb deadplayer abhi bhi screen pe rhenge toh hum active player ko remove krdenge iske sath but isme kya hoga 
  // ki huamra jo h voh for loop me chl rha h active palyer ko chedenge toh uska count decrease hoagg or for loop jo n number ke liye chlega woh ab n-1 ke liye chlne lgega
  // 1st nhi krenge 

  // arrow fucniton wala sbse optimal rhega but isme kaafi changes h plua neares fucniton ka jo simple code h voh mushkil hojayega kyuki usme hum oppp or our derhe the 

  // 3rd option deadid wala dekht eh 

  // Option 3 (mera pehla solution) sabse kam changes mangta hai aur efficient hai, lekin opp/our maintain karna extra overhead hai agar unka koi special use nahi (jaise tumhare game mein abhi nahi dikhta). Option 2 simpler aur cleaner hai long-term ke liye


} 

  if (player.currentFrame && player.currentFrame.img) {
          if(player.state === 'idle'){
  if(player.type === 'towers'){
    ctx.drawImage(player.currentFrame,player.xdraw,player.ydraw,player.ww,player.hh);
  }
}
else{
    ctx.drawImage(player.currentFrame.img, player.x, player.y, playersize, playersize);
    
}
player.currentFrame = player.currentFrame.next;
  } 
  // If it’s a tower (just an Image element)
  else if (player.currentFrame instanceof HTMLImageElement) {
      if(player.state === 'idle'){
  if(player.type === 'towers'){
    ctx.drawImage(player.currentFrame,player.xdraw,player.ydraw,player.ww,player.hh);
  }
}
  }
  drawHealthBar(ctx, player);

 }// sbke liye image bandega jitne bhi aactive state h 
 // and then baadme hum requestanimateframe krenge ki recursion hojaaye 
// mtlb chije dubara se bne 
   
if (deadIds.length > 0) {
    activeplayers = activeplayers.filter(p => !deadIds.includes(p.id));
  // So !deadIds.includes(p.id) means:
// “Keep this player if their id is NOT in deadIds.”
// Ab player marne ke baad ek frame late gayab hota hai —
// but ye intentional aur safe delay hai,
// game ke logic me koi problem nahi hoti.
  }
const ourkingalive = activeplayers.some(p => p.id.includes("ourking"));
const oppkingalive = activeplayers.some(p => p.id.includes("oppking"));

 
if (absolutecounter > 0 && ourkingalive && oppkingalive) {
    setTimeout(() => requestAnimationFrame(gameloop), 100);
  } 
  else {
    if (flag) {
      flag = false;  // mark final frame is being drawn
      console.log("Running one final cleanup frame...");
      
      // force one last frame to clean up visuals
      setTimeout(() => {
        requestAnimationFrame(() => {
          gameloop(); // one last frame only
        });
      }, 100);

      return; 
    }

    // Now safe to stop after final frame
    stopgame();
  }


}


// Function to send match result to backend
function recordMatchResult(didWeWin) {
  // Only record if not already recorded this session
  if (window.matchResultRecorded) return;
  
  // Skip if this was a resignation (already handled by /api/match_resign)
  if (window._lastMatchWasResignation) {
    console.log('Skipping recordMatchResult - resignation already handled');
    window.matchResultRecorded = true;
    return;
  }
  
  window.matchResultRecorded = true;
  
  // ✅ ONLY record multiplayer matches (Play Online with room)
  // ❌ Do NOT record: local matches (Play from both sides) or AI matches (Play with bot)
  if (!isMultiplayerMode || !currentRoom) {
    console.log('Match result NOT recorded - only multiplayer matches count');
    return;
  }
  
  fetch('/api/match_result', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      result: didWeWin ? 'win' : 'loss'
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.ok) {
      console.log('✅ Multiplayer match result recorded:', data.user);
    }
  })
  .catch(err => console.error('Failed to record match result:', err));
}

function stopgame(opts = {}) {
  // opts: { isResignation: bool, weWon: bool, reason: string }
  const { isResignation = false, weWon = false, reason = '' } = opts;
  
  window.gameEnded = true;

  // Mark saved state as ended (so reload won't restore)
  try {
    const saved = localStorage.getItem(GAME_STATE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      state.gameEnded = true;
      localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    console.error('Failed to mark game state as ended:', e);
  }

  // Clear saved game state immediately (so the next match won't restore this)
  clearGameState();

  // Schedule an auto-clear in case some other process wrote state later
  if (window._clearGameTimeout) {
    clearTimeout(window._clearGameTimeout);
    window._clearGameTimeout = null;
  }
  window._clearGameTimeout = setTimeout(() => {
    try {
      clearGameState();
      console.log('Auto-cleared saved game state after match end.');
    } catch (e) {
      console.error('Auto-clear failed:', e);
    }
  }, AUTO_CLEAR_AFTER_MS);

  // Create an "Exit to Home" button (if not already present)
  if (!document.getElementById('exitToHomeBtn')) {
    const btn = document.createElement('button');
    btn.id = 'exitToHomeBtn';
    btn.textContent = 'Exit to Home';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: '20px',
      padding: '12px 20px',
      background: '#ffd700',
      color: '#000',
      border: 'none',
      borderRadius: '8px',
      fontWeight: '700',
      zIndex: 999999,
      cursor: 'pointer'
    });
    btn.addEventListener('click', () => {
      // cancel the auto-clear to avoid race, clear state and go home
      if (window._clearGameTimeout) {
        clearTimeout(window._clearGameTimeout);
        window._clearGameTimeout = null;
      }
      clearGameState();
      // optional: remove the button before redirect
      try { btn.remove(); } catch(e){}
      // redirect to homepage (adjust url if needed)
      window.location.href = '/';
    });
    document.body.appendChild(btn);
  }
  
  // If this is a resignation, draw special resignation screen
  if (isResignation) {
    // Clear canvas and draw background
    if (isMultiplayerMode) {
      const scale = Math.min(canvas.width / bgimage2.width, canvas.height / bgimage2.height);
      const x = (canvas.width - bgimage2.width * scale) / 2;
      const y = (canvas.height - bgimage2.height * scale) / 2;
      ctx.drawImage(bgimage2, x, y, bgimage2.width * scale, bgimage2.height * scale);
    } else {
      ctx.drawImage(bgimage, 0, 0, canvas.width, canvas.height - 20);
    }
      // Display opponent name as winner
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(oppPlayerName, 250, 275);
    ctx.fillText(oppPlayerName, 250, 275);
    // Display our name as winner
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(ourPlayerName, 250, 555);
    ctx.fillText(ourPlayerName, 250, 555);
    
    // Draw VS and cushions
    ctx.font = "bold 45px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VS", 250, 360);
    ctx.drawImage(cushionblue, 40, 400, 420, 220);
    ctx.drawImage(cushionred, 40, 120, 420, 220);
    
    // Draw resignation message - larger and more visible
    const resignMsg = reason === 'disconnect' ? 'OPPONENT DISCONNECTED!' : 'OPPONENT RESIGNED!';
    
    // Show crown and message based on who won
    // weWon = true means opponent left, so WE are the winner
    if (weWon) {
     // We left/resigned → OPPONENT WINS
      // This screen shouldn't normally show because we left the page
      // But if it does, show opponent's crown at top
      ctx.drawImage(crownred, 172, 120, 150, 120); // top crown (opponent side)
      
      // Show message that we left
      ctx.font = "bold 55px Arial";
      ctx.fillStyle = "#ff6b6b";
      ctx.fillText("YOU LEFT", 250, 400);
      
      ctx.font = "bold 24px Arial";
      ctx.fillStyle = "#aaa";
      ctx.fillText("Opponent wins by default", 250, 450);
      
    } else {
       // Opponent left/resigned → WE WIN
      // Show our crown at bottom (blue)
      ctx.drawImage(crownblue, 172, 362, 150, 190); // bottom crown (our side)
      
      // Winner text at bottom (our side)
      ctx.font = "bold 55px Arial";
      ctx.fillStyle = "#FFD700"; // Gold color
      ctx.fillText("YOU WIN!", 250, 550);
      
      // Resignation reason below
      ctx.font = "bold 24px Arial";
      ctx.fillStyle = "#ff6b6b";
      ctx.fillText(resignMsg, 250, 600);
    }
    
    // Don't proceed with normal tower checking
    return;
  }
  
  // Draw static "VS" and cushions (for normal game end)
  ctx.font = "bold 45px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", 250, 360);

  ctx.drawImage(cushionblue, 40, 400, 420, 220);
  ctx.drawImage(cushionred, 40, 120, 420, 220);
// Ye check karta hai:
// “Kya activeplayers array me koi aisa player hai jiska id me "opparcher0" likha hua hai?”
// Agar mil gaya → true
// Agar nahi mila → false
  // ✅ Determine tower survival states
  const ourTowersAlive = {
    left: activeplayers.some(p => p.id.includes("ourarcher0")),
    right: activeplayers.some(p => p.id.includes("ourarcher1")),
    king: activeplayers.some(p => p.id.includes("ourking")),
  };
  const oppTowersAlive = {
    left: activeplayers.some(p => p.id.includes("opparcher0")),
    right: activeplayers.some(p => p.id.includes("opparcher1")),
    king: activeplayers.some(p => p.id.includes("oppking")),
  };

    // Display opponent name as winner
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(oppPlayerName, 250, 275);
    ctx.fillText(oppPlayerName, 250, 275);
    // Display our name as winner
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.strokeText(ourPlayerName, 250, 555);
    ctx.fillText(ourPlayerName, 250, 555);
    
    
  

  // iske baad hum code likh re honge usme kya hoga 
  //  ki if me king maardeta hu unka toh m jeet gya jiska mtlb h ki ttwwno corwns dikhenge meri side pe
if (!ourTowersAlive.king && oppTowersAlive.king) {
   // humara milna check krna jruri h 

    // our king dead, opp king alive → opp wins
   ctx.drawImage(crownred, 172, 120, 150, 120);
   ctx.drawImage(crownred, 272, 130, 150, 120);
   ctx.drawImage(crownred, 75, 130, 150, 120);

    ctx.font = "bold 55px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("WINNER", 250, 120);
    
    // Record loss
    recordMatchResult(false);
    return;
  } else if (ourTowersAlive.king && !oppTowersAlive.king) {
    // opp king dead, our king alive → we win
     ctx.drawImage(crownblue, 172, 362, 150, 190);
     ctx.drawImage(crownblue, 280, 382, 137, 175);
     ctx.drawImage(crownblue, 80, 382, 137, 175);
    
   
    ctx.font = "bold 55px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("WINNER", 250, 600);
    
    // Record win
    recordMatchResult(true);
    return;
  }

 // Crown for opponent when our tower dies
if (!ourTowersAlive.king) ctx.drawImage(crownred, 172, 120, 150, 120); 
if (!ourTowersAlive.right) ctx.drawImage(crownred, 272, 130, 150, 120);
if (!ourTowersAlive.left) ctx.drawImage(crownred, 75, 130, 150, 120);

// Crown for us when opponent's towers die
if (!oppTowersAlive.king) ctx.drawImage(crownblue, 172, 362, 150, 190);
if (!oppTowersAlive.right) ctx.drawImage(crownblue, 280, 382, 137, 175);
if (!oppTowersAlive.left) ctx.drawImage(crownblue, 80, 382, 137, 175);

  //  Decide the winner
  ctx.font = "bold 55px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
 // humare yjada tute h toh woh jitega 
 // uske jyada tute h toh hum jeetenge 
 // our dest me hum check kret h ki kya humara left wala tuta  hn toh 0 na toh 1 
 // ourtowersalive.left agar true toh 0 nhi toh 1 
 // agar humare dono mr gye toh ourdest hojayefa 2 
 // agar unke dono mar gye toh oppdest hojayega 2
 // agar humare dono mar gye toh hum haar rhe h or woh jeet rha h 
 // oth jiska score km hoga woh jeet rha hoga 
 // agar humar score km h hum jeet gye 
 
 
 // King-based decisive logic
  
  // If both kings alive or both dead, compare remaining towers
  const ourdest =
    (ourTowersAlive.left ? 0 : 1) + 
    (ourTowersAlive.right ? 0 : 1);
  const oppdest =
    (oppTowersAlive.left ? 0 : 1) +
    (oppTowersAlive.right ? 0 : 1);

  if (ourdest < oppdest) {
    
    ctx.font = "bold 55px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("WINNER", 250, 600); // blue (bottom)
    
    // Record win
    recordMatchResult(true);
  } else if (oppdest < ourdest) {
    ctx.font = "bold 55px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("WINNER", 250, 120); // red (top)
    
    // Record loss
    recordMatchResult(false);
  } else {
    absolutecounter += 60;
    gameloop();
  }
}

function attackfunction(player, samnewala) {
  if(samnewala.health){
  samnewala.health -= player.power;
  }

  if (samnewala.health <= 0) {
    return samnewala.id;   // id return karo
  } 
  if (player.health <= 0) {
    return player.id;      // agar future me tu dono taraf ka damage kare
  }
  return null; // koi dead nahi
}
const OPP_MAX_Y = 400;   // top half
const OUR_MIN_Y = 300;   // bottom half


canvas.addEventListener("dragover", (event) => {
  event.preventDefault(); // default rokna zaroori hai
    if (currentDragSide === "our") {
    isDraggingOur = true;
    isDraggingOpp = false;
  } else if (currentDragSide === "opp") {
    isDraggingOpp = true;
    isDraggingOur = false;
  }
});

// Handle drop
// make sure playersize is defined (you already have playersize = 140)
function onDragStart(event, type, opp_or_not) {
  event.dataTransfer.setData("characterType", type);
  event.dataTransfer.setData("opp_or_not", opp_or_not);
  currentDragSide = opp_or_not;
  // Force the browser drag-ghost to be centered under the cursor
  // so the pointer correlates with the center of the card/sprite.
  // Use the dragged element itself as drag image and center hotspot.
  const img = event.target;
  const rect = img.getBoundingClientRect();
  // center hotspot horizontally & vertically
  const hotX = Math.round(rect.width / 2);
  const hotY = Math.round(rect.height / 2);
  try {
    event.dataTransfer.setDragImage(img, hotX, hotY);
  } catch (e) {
    // some browsers may not allow custom drag image for security reasons;
    // the try/catch prevents crashes.
  }
}

canvas.addEventListener("dragleave", (event) => {
  event.preventDefault();
  isDraggingOur = false;
  isDraggingOpp = false;
  currentDragSide = null;
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  isDraggingOur = false;
  isDraggingOpp = false;
  currentDragSide = null;

  const type = event.dataTransfer.getData("characterType");
  const opp_or_not = event.dataTransfer.getData("opp_or_not");

  const needed = attackpower[type.toLowerCase()].elixir_needed;
  const current = (opp_or_not === 'our') ? current_elixirour : current_elixiropp;

  // Check if enough elixir
  if (current < needed) {
    return;  // Don't spawn
  }

  const rect = canvas.getBoundingClientRect();

  // scale from CSS pixels to canvas pixels (robust)
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const xCss = event.clientX - rect.left;
  const yCss = event.clientY - rect.top;

  // mapped to canvas coordinate system
  let x = xCss * scaleX;
  let y = yCss * scaleY;

  // --- IMPORTANT: center the sprite on the pointer (so it doesn't appear right/bottom) ---
  x = Math.round(x - playersize / 2);
  y = Math.round(y - playersize / 2);

  // clamp inside canvas edges (optional but useful)
  x = Math.max(0, Math.min(canvas.width - playersize, x));
  y = Math.max(0, Math.min(canvas.height - playersize, y));

  
  if (opp_or_not === "our") {
    // hum sirf bottom area me spawn kar sakte hain (compare center Y)
    const centerY = y + Math.floor(playersize / 2);
    if (centerY < canvas.height / 2) {
      return;
    }
  } else if (opp_or_not === "opp") {
    // opponent sirf top area me spawn kar sakta hai (compare center Y)
    const centerY = y + Math.floor(playersize / 2);
    if (centerY > canvas.height / 2) {
      return;
    }
  }


  makeActive(type, x, y, opp_or_not);
});

// ==============================
// Touch support for mobile
// Mirrors desktop drag/drop logic
// ==============================
let touchDrag = null; // { type, side, src, w, h }
let dragGhostEl = null; // floating image following finger

function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
}

function preventContextMenus() {
  // Prevent long-press save image menu on mobile for images and canvas
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'IMG' || t.id === 'canvas')) {
      e.preventDefault();
    }
  }, { passive: false });
}

function onTouchStartCard(e, type, side) {
  if (!isTouchDevice()) return;
  // Prevent scroll/zoom and native image actions
   e.preventDefault();

  const needed = attackpower[type.toLowerCase()].elixir_needed;
  const current = (side === 'our') ? current_elixirour : current_elixiropp;

  // 🔥 Add this early return — just like desktop dragStart
  if (current < needed) {
    return; // Not enough elixir — don't start drag
  }
  const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  const src = e.currentTarget && e.currentTarget.src ? e.currentTarget.src : null;
  const w = e.currentTarget ? e.currentTarget.clientWidth : 48;
  const h = e.currentTarget ? e.currentTarget.clientHeight : 48;
  touchDrag = { type, side, src, w, h };
  currentDragSide = side;
  if (side === 'our') {
    isDraggingOur = true;
    isDraggingOpp = false;
  } else if (side === 'opp') {
    isDraggingOpp = true;
    isDraggingOur = false;
  }

  if (src && touch) {
    createDragGhost(src, touch.clientX, touch.clientY, w, h);
  }
}

canvas.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  isDraggingOur = false;
  isDraggingOpp = false;
  currentDragSide = null;
  touchDrag = null;
  removeDragGhost();
}, { passive: false });

function onTouchMove(e) {
  if (!touchDrag) return;
  // Avoid page scroll while dragging
  e.preventDefault();
  const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (touch && dragGhostEl) {
    moveDragGhost(touch.clientX, touch.clientY);
  }
}

function onTouchEnd(e) {
  if (!touchDrag) return;
  e.preventDefault();

  const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  if (!touch) {
    // reset states
    isDraggingOur = false;
    isDraggingOpp = false;
    currentDragSide = null;
    touchDrag = null;
    removeDragGhost();
    return;
  }

  const { type, side } = touchDrag;

  // Elixir check first
  const needed = attackpower[type.toLowerCase()].elixir_needed;
  const current = (side === 'our') ? current_elixirour : current_elixiropp;
  if (current < needed) {
    // Not enough elixir; just reset
    isDraggingOur = false;
    isDraggingOpp = false;
    currentDragSide = null;
    touchDrag = null;
    return;
  }

  // Map touch to canvas coordinates
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const xCss = touch.clientX - rect.left;
  const yCss = touch.clientY - rect.top;
  let x = xCss * scaleX;
  let y = yCss * scaleY;
  // center the sprite on the pointer
  x = Math.round(x - playersize / 2);
  y = Math.round(y - playersize / 2);
  // clamp inside canvas
  x = Math.max(0, Math.min(canvas.width - playersize, x));
  y = Math.max(0, Math.min(canvas.height - playersize, y));

  // Side restrictions (same as desktop drop)
  const centerY = y + Math.floor(playersize / 2);
  if (side === 'our' && centerY < canvas.height / 2) {
    // invalid drop zone for our side
  } else if (side === 'opp' && centerY > canvas.height / 2) {
    // invalid drop zone for opp side
  } else {
    makeActive(type, x, y, side);
  }

  // reset states
  isDraggingOur = false;
  isDraggingOpp = false;
  currentDragSide = null;
  touchDrag = null;
  removeDragGhost();
}

function initTouchDrag() {
  if (!isTouchDevice()) return;

  // map element id -> { type, side }
  const mapping = {
    'our-knight': { type: 'knight', side: 'our' },
    'our-valk': { type: 'valkyrie', side: 'our' },
    'our-pekka': { type: 'pekka', side: 'our' },
    'our-royal_giant': { type: 'royal_giant', side: 'our' },
    'opp-knight': { type: 'knight', side: 'opp' },
    'opp-valk': { type: 'valkyrie', side: 'opp' },
    'opp-pekka': { type: 'pekka', side: 'opp' },
    'opp-royal_giant': { type: 'royal_giant', side: 'opp' }
  };

  Object.keys(mapping).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // reduce native gestures on images
    el.style.touchAction = 'none';
    // Prevent callout if CSS misses
    el.setAttribute('draggable', el.getAttribute('draggable') || 'true');
    el.addEventListener('touchstart', (e) => onTouchStartCard(e, mapping[id].type, mapping[id].side), { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });
  });

  // also prevent default gestures on canvas while interacting
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

  preventContextMenus();
}

// ------- Ghost preview helpers -------
function createDragGhost(src, x, y, w, h) {
  removeDragGhost();
  const img = document.createElement('img');
  img.src = src;
  img.style.position = 'fixed';
  img.style.left = x + 'px';
  img.style.top = y + 'px';
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.pointerEvents = 'none';
  img.style.opacity = '0.85';
  img.style.transform = 'translate(-50%, -50%)';
  img.style.zIndex = '99999';
  dragGhostEl = img;
  document.body.appendChild(img);
}

function moveDragGhost(x, y) {
  if (!dragGhostEl) return;
  dragGhostEl.style.left = x + 'px';
  dragGhostEl.style.top = y + 'px';
}

function removeDragGhost() {
  if (dragGhostEl && dragGhostEl.parentNode) {
    dragGhostEl.parentNode.removeChild(dragGhostEl);
  }
  dragGhostEl = null;
}

//oppp //our
// our me kya h saare humare playera dn uske x y ki information
// hume ek aisa dynamic array bnana chaiye jo opp or our ki info  
// ek  ko pka ek character ko ab voh pure array ko traverse krega and find krega 
// ki kiski value km aayi h uske hi piche chla jaayega value absoulute hi hogi 

// our me dher saari ID h 
// ek ek id pkd rha h 
// ux ko set kar rha h us id and 0 pe  
// our = {
//   "OUR1": [100, 300],
//   "OUR2": [200, 400]
// }
function getNearestEnemy(player, enemyGroup) {
  let mindist = Infinity;
  let nearest = null;
  // let kitnapass ;
// nearest ka code jo player ko uhtayega and opp ke saare player me se ek near dega
// and yeh har frame ke liye chal rha hoga toh at that second woh turn bhi leskta h 
  // if (player.opp === 'our'){
  //    kitnapass = 40
  // }
  // if(player.opp ==="opp"){
  //   kitnapass = 65;
  // }

  const baseRange = 60;

  //  Adjusted range based on player’s Y position
  const perspectiveScale = getPerspectiveScale(player.y);
  let  kitnapass = baseRange * perspectiveScale;
  kitnapass = 52;

  for (let eid in enemyGroup) {
    let ex = enemyGroup[eid][0];
    let ey = enemyGroup[eid][1];

    let dx = ex - player.x;
    let dy = ey - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < mindist) {// euclidiean formulaar 
      mindist = dist;
      nearest = { id: eid, x: ex, y: ey, dist: dist , kitnapass };
    }
  }

  return nearest;
}
const attackpower = {
  pekka : {
   power: 3,
   speed: 2.3,
   elixir_needed : 5
  },
  valkyrie : {
   power: 1.3,
   speed: 5,
   elixir_needed : 3
  },
  knight : {
   power: 1,
   speed: 3,
   elixir_needed : 3
  },
  royal_giant : {
   power: 3,
   speed: 1.5,
   elixir_needed : 4

  }
}

// call this when local player resigns (explicit leave while in a room)
function emitResignToServer() {
  if (!isMultiplayerMode || !socket || !currentRoom) return;
  try {
    socket.emit('player_resign', {
      room: currentRoom,
      player: playerPosition || myPosition || null, // use whatever identifies the player: position or username
      playerId: (typeof auth !== 'undefined' && auth && auth.id) ? auth.id : null
    });
    console.log('Sent resign to server');
  } catch (e) {
    console.warn('Resign emit failed', e);
  }
}
function leaveGameImmediate() {
  // mark left so autosaves stop
  window.gameEnded = true;

  // if multiplayer: signal resignation to server before disconnecting
  if (isMultiplayerMode && typeof socket !== 'undefined' && socket) {
    emitResignToServer();
    // give socket a tiny moment to send, or rely on server side handling even if disconnected
  }

  // continue with clearing etc.
  if (window._clearGameTimeout) { clearTimeout(window._clearGameTimeout); window._clearGameTimeout = null; }
  if (typeof saveStateInterval !== 'undefined' && saveStateInterval !== null) { clearInterval(saveStateInterval); saveStateInterval = null; }
  try { clearGameState(); } catch(e) {}
  try {
    if (typeof socket !== 'undefined' && socket && typeof socket.disconnect === 'function') {
      socket.disconnect();
    }
  } catch(e) { console.warn('socket leave error', e); }

  // redirect home
  window.location.href = '/';
}


function spawnTower(type, x, y, w, h, opp_or_not) {
  //active players me dalta h just 
  let imageRef;
  let size;

  if (type === "opparcher0") {
  xx=75;
  yy=100;
  size=80;
  imageRef = opparcher0
  }
  else if (type === "opparcher1") {imageRef = opparcher1;
  xx=345;
  yy=100;
  size=80;
  }
  else if (type === "ourarcher0") {imageRef = ourarcher0;
  xx=75;
  yy=500;//540
  size=80;
  }
  else if (type === "ourarcher1") {imageRef = ourarcher1;
  xx=345;
  yy=500;//540
  size=80;
  }
  else if (type === "oppking") {imageRef = oppking;
  xx=210;
  yy=80;
  size=80;
  }
  else if (type === "ourking") {imageRef = ourking;
  xx=210;
  yy=520;//560
  size=80;
  }
// ctx.fillRect(75, 100, 80, 80);
// ctx.fillRect(210, 80, 80, 80);
// ctx.fillRect(345, 100, 80, 80);
// // our side ke 
// ctx.fillRect(75, 540, 80, 80);
// ctx.fillRect(210, 560, 80, 80);
// ctx.fillRect(345, 540, 80, 80);

  activeplayers.push({
    id: `${type}_${Date.now()}`,
    type: 'towers',
    opp: opp_or_not,
    w:size,
    h:size,
    ww: w,
    hh: h,
    xdraw:x,
    ydraw:y,
    x: xx,
    y: yy,
    dx: 0,
    dy: 0,
    power:3,
    health: 200,
    maxhealth : 200,
    state: "idle",
    currentFrame: imageRef // yaha ab actual image object gaya
  });
}


function drawtowers(activeplayer){
for (let active of activeplayer){
  // yeh draw krta h just 
  if(active.state === 'idle'){
  if(active.type === 'towers'){
    ctx.drawImage(active.currentFrame,active.xdraw,active.ydraw,active.ww,active.hh);
  }
}
}
}
// function ourdeck(){
//    ctx.drawImage(ourwiz, 340, 630, 60, 60);
//     ctx.drawImage(ourvalk, 220, 630, 60, 60);
//     ctx.drawImage(ourpekka, 400, 630, 60, 60);
//     ctx.drawImage(ourroyal_giant, 280, 630, 60, 60);
    
// }
// function drawourbar(){
//     ctx.drawImage(ourbar,200, 670, 290, 60);
// }

// function oppdeck(){
//   ctx.drawImage(oppwiz, 340, 30, 60, 60);
//     ctx.drawImage(oppvalk, 220, 30, 60, 60);
//     ctx.drawImage(opppekka, 400, 30, 60, 60);
//     ctx.drawImage(opproyal_giant, 280, 30, 60, 60);
// }
// function drawoppbar(){
//    ctx.drawImage(oppbar,200, -15, 290, 60);

// }


window.onload = () => {
  // resizeCanvas();
  placeDeckAndBars();
  createExitButton();
  createChatUI(); // Initialize chat UI for multiplayer
  // Try to restore saved game state
  const restored = restoreGameState();
  
  if (!restored) {
    // No saved state, spawn towers normally
    // Our towers
    spawnTower("opparcher0", 75, 100, 80 , 100 ,"opp");//75//100
    spawnTower("opparcher1", 330, 100,80,100 ,"opp");//330
    spawnTower("oppking", 190, 80, 100,120 , "opp");//190
    

    // Opp towers
    spawnTower("ourarcher0", 55, 500,120,140 ,"our");//75
    spawnTower("ourarcher1", 310, 500,120,140, "our");//310
    spawnTower("ourking", 150,510, 180,180, "our");//150
  } else {
    console.log('Game state restored from previous session');
  }
  
  // Setup multiplayer socket listeners
  if (isMultiplayerMode && typeof socket !== 'undefined' && socket) {
    setupMultiplayerListeners();
  }
  
  // Setup AI mode
  if (isAiMode) {
    MakeOppDeckUnavailable();
    scheduleAiSpawn();
  }
  
  // In multiplayer, disable opponent deck for both players
  if (isMultiplayerMode) {
    MakeOppDeckUnavailable();
  }
  
  gameloop();
};

// Multiplayer socket listeners
function setupMultiplayerListeners() {
  if (!socket) return;
  
  // Listen for opponent name
  socket.on('opponent_info', (data) => {
    if (data.name) {
      oppPlayerName = data.name;
      console.log('Opponent name set to:', oppPlayerName);
    }
  });

  socket.on('room_joined', (data) => {
  console.log('room_joined:', data);

  myPosition = data.position;
  
  if (data.you) ourPlayerName = data.you;
  if (data.opponent) oppPlayerName = data.opponent;

  console.log('ourPlayerName:', ourPlayerName, 'oppPlayerName:', oppPlayerName);
});

  
socket.on('opponent_spawn', (data) => {
  console.log('RECV spawn (norm):', data);

  // denormalize to **local** canvas pixels
  const centerX = data.nx * canvas.width;
  const centerY = data.ny * canvas.height;

  // mirror vertically across canvas center
  const mirroredCenterY = canvas.height - centerY;

  // convert center -> top-left using local playersize
  const spawnX = Math.round(centerX - playersize / 2);
  const spawnY = Math.round(mirroredCenterY - playersize / 2);

  const clampedX = Math.max(0, Math.min(canvas.width - playersize, spawnX));
  const clampedY = Math.max(0, Math.min(canvas.height - playersize, spawnY));

  console.log('SPAWN computed', { centerX, centerY, mirroredCenterY, spawnX, spawnY, clampedX, clampedY });

  makeActive(data.type, clampedX, clampedY, 'opp', true);
});

  
  // Listen for timer updates (player2 syncs with player1)
  socket.on('timer_update', (data) => {
    if (playerPosition === 'player2') {
      absolutecounter = data.absolutecounter;
      isTimerSynced = true;
    }
  });
  
  // Listen for room updates to get opponent name
  socket.on('room_update', (data) => {
    console.log('Room update:', data);
    if (data.members && data.members.length > 0) {
      // Find opponent's name
      const opponent = data.members.find(m => m.position !== playerPosition);
      if (opponent && opponent.name) {
        oppPlayerName = opponent.name;
        console.log('Opponent name updated to:', oppPlayerName);
      }
    }
  });

  // Listen for incoming chat messages
  socket.on('chat_message', (data) => {
    console.log('Received chat message:', data);
    // data: { sender: 'username', text: '...' }
    // Display as 'Opponent' in UI
    addChatMessage('Opponent', data.text);
  });

  // Listen for player resignation (opponent left/disconnected)
  socket.on('player_resigned', (data) => {
    console.log('Player resigned:', data);
    // data: { room, reason, winner_position, loser_position }
    
    // Mark that this was a resignation (not a normal win)
    window._lastMatchWasResignation = true;
    
    // Determine if we are the winner
    const weAreWinner = (data.winner_position === playerPosition);
    
    // Call resignation match result API
    if (typeof auth !== 'undefined' && auth && auth.id) {
      fetch('/api/match_resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ is_winner: weAreWinner })
      })
      .then(res => res.json())
      .then(json => {
        if (json.ok) {
          console.log('✅ Resignation result recorded:', json.user);
          // Update UI trophies if element exists
          const trophyEl = document.getElementById('userTrophies');
          if (trophyEl) trophyEl.textContent = json.user.trophies;
        }
      })
      .catch(err => console.error('Failed to record resignation:', err));
    }
    
    // Call stopgame to show result (winner gets crown, loser gets nothing)
    // Pass special flag to show resignation message
    stopgame({ 
      isResignation: true, 
      weWon: weAreWinner,
      reason: data.reason 
    });
  });
}

// Mirror Y coordinate for opponent view
function mirrorY(y) {
  // Canvas height is 720
  // If player spawns at y=500 (bottom), opponent sees it at y=220 (top)
  // Formula: mirroredY = canvasHeight - y - playersize
  const canvasHeight = 720;
  return canvasHeight - y - playersize;
}

function setPos(id, x, y, w, h) {
  const el = document.getElementById(id);
  if (!el) return;

  const px = (x / 480) * 100;   
  const py = (y / 720) * 100;  
  const pw = (w / 480) * 100;
  const ph = (h / 720) * 100;

  el.style.left = px + "%";
  el.style.top = py + "%";
  el.style.width = pw + "%";
  el.style.height = ph + "%";
}

// ctx.fillRect(x, y, w, h)



function placeDeckAndBars() {
  // our deck
  // if (isMultiplayerMode){
  // setPos("our-knight",   335, 625, 72, 60);
  // setPos("our-valk",  220, 625, 60, 60);
  // setPos("our-pekka", 400, 625, 60, 60);
  // setPos("our-royal_giant", 280, 625, 60, 60);
  // setPos("our-bar",   200, 660, 290, 60);
  // }
  // else{
  setPos("our-knight",   335, 603, 72, 60);
  setPos("our-valk",  220, 603, 60, 60);
  setPos("our-pekka", 400, 603, 60, 60);
  setPos("our-royal_giant", 280, 603, 60, 60);
  setPos("our-bar",   200, 643, 290, 60);
  // }

  // opp deck
  setPos("opp-knight",   335, 30, 72, 60);
  setPos("opp-valk",  220, 30, 60, 60);
  setPos("opp-pekka", 400, 30, 60, 60);
  setPos("opp-royal_giant", 280, 30, 60, 60);
  setPos("opp-bar",   200, -15, 290, 60);
}



function drawHealthBar(ctx, player) {
  if (typeof player.health !== "number" || player.health <= 0) return;

  // Team colors
  const teamIsOur = (player.opp === 'our');
  const teamColorStart = teamIsOur ? "#66d3ff" : "#ff8a66"; // gradient start
  const teamColorEnd   = teamIsOur ? "#0088ff" : "#ff3b1f"; // gradient end
  const glowColor      = teamIsOur ? "rgba(102,211,255,0.6)" : "rgba(255,138,102,0.55)";

  // Halo / ring under sprite (soft, subtle)
  // const haloX = player.x + playersize/2;
  // const haloY = player.y + playersize - 6;
  // ctx.beginPath();
  // ctx.ellipse(haloX, haloY, playersize/2.2, playersize/6, 0, 0, Math.PI*2);
  // ctx.fillStyle = teamIsOur ? "rgba(102,211,255,0.10)" : "rgba(255,138,102,0.10)";
  // ctx.fill();

  // Smooth health display
  player.displayHealth = player.displayHealth ?? player.health;
  player.displayHealth += (player.health - player.displayHealth) * 0.15;
  const hpPercent = Math.max(0, Math.min(1, player.displayHealth / (player.maxhealth || 100)));

  // Health bar placement
  const barWidth = 54;
  const barHeight = 8;
  const x = Math.round(player.x + playersize / 2 - barWidth / 2);
  const y = Math.round(player.y - 10);

  // background capsule
  ctx.beginPath();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.roundRect(x - 1, y - 1, barWidth + 2, barHeight + 2, barHeight/2);
  ctx.fill();

  // gradient fill by team
  const grad = ctx.createLinearGradient(x, y, x + barWidth, y);
  grad.addColorStop(0, teamColorStart);
  grad.addColorStop(1, teamColorEnd);

  ctx.beginPath();
  ctx.fillStyle = grad;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 3;
  ctx.roundRect(x, y, Math.max(0.001, barWidth * hpPercent), barHeight, barHeight/2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // tiny white shine
  ctx.beginPath();
  const shineGrad = ctx.createLinearGradient(x, y, x, y + barHeight);
  shineGrad.addColorStop(0, "rgba(255,255,255,0.28)");
  shineGrad.addColorStop(0.5, "rgba(255,255,255,0.08)");
  shineGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shineGrad;
  ctx.roundRect(x, y, barWidth * hpPercent, barHeight / 2, barHeight/2);
  ctx.fill();

  // Optional small percentage text (tiny)
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.9;
  ctx.fillText(Math.round(hpPercent*100) + "%", x + barWidth/2, y + barHeight/2);
  ctx.globalAlpha = 1;

  // Small name/team tag above bar: 'You' vs 'Enemy' or type initial
  const tagText = teamIsOur ? (player.type ? player.type.charAt(0).toUpperCase() + player.type.slice(1) : "You") : "Enemy";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = teamIsOur ? "#bfefff" : "#ffd4c4";
  ctx.fillText(tagText, x + barWidth/2, y - 10);
}


function getPerspectiveScale(y) {
  // y = 0 (top of canvas) → scale = 1.5 (zoomed out)
  // y = canvas.height (bottom) → scale = 1.0 (zoomed in)
  const minScale = 1.0;
  const maxScale = 1.25;
  return maxScale - ((y / canvas.height) * (maxScale - minScale));
}


//deck ke character ka array bnana h 
function MakeOppDeckUnavailable() {
  // disable all opponent cards so player can't drag/spawn them in AI mode
  cardidoppnew.forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    card.draggable = false;
    // ensure any dragstart is prevented (extra safety)
    card.ondragstart = (e) => { e.preventDefault(); return false; };
    // visual feedback
    // card.style.filter = "grayscale(100%) brightness(60%)";
    card.style.cursor = "not-allowed";
    card.setAttribute("aria-disabled", "true");
    card.style.pointerEvents = "auto";
  });
}

// function elexir_check(){
//   const ourList = activeplayers
//     .filter(p => p.opp === 'our')
//     .map(p => ({ id: p.id, x: p.x, y: p.y }));

// // ek new array bnadega jisme kya hoga ki ourlsit me sirf our ke id x and y horhe honge

//   const spawnCount = getRandomInt(1, 3);
// // spawncount kitne spawn krne h ek baari me  1 se leke 3 hoskte h 
// // toh yeh jitne bche huye elexir honge usse baatega 

//   const affordableChars = Object.keys(attackpower).filter(
//     k => attackpower[k].elixir_needed <= current_elixiropp
//   );
//   //  yeh jo attackpower tha uski keys ko string me bdal dega
//   // Object.keys(attackpower) gives ['pekka', 'valkyrie', 'knight', 'royal_giant']
//   // The .filter() function will now iterate over these keys:
// // For 'pekka', the elixir_needed is 5. Since 5 > 4, it will not be included in the affordableChars array.
// //  So, after filtering, affordableChars will look like this: [valk , knight]
// // iska mtlb h ki aap whi hi spawn krskte ho   
//   if (affordableChars.length === 0) {
//     // can't buy anything right now
//     // khali h toh bhar aajao 
//     return;
//   }
// // ✅ You’re right — strictly speaking,
// // that first affordableChars outside the loop isn’t needed
// // since the loop re-checks affordableNow anyway.

// // It’s mostly there for:

// // Early exit — to avoid running the whole spawn loop if no cards are affordable at all right now.

// // Readability — it’s a clear "pre-check" before the main loop starts
  
//   for (let i = 0; i < spawnCount; i++) {
//     // yeh jitnei baar spawn krna hoga utni baar ke liye chlega
//     // ab kitne spawn krne h uske hisab se spawn krenge 
//     // Recalc affordable each loop in case elixir changes during spawns
//     const affordableNow = Object.keys(attackpower).filter(
//       k => attackpower[k].elixir_needed <= current_elixiropp
//     );
//     if (affordableNow.length === 0) break;

//     // pick a random char AI can afford
//     const char = affordableNow[getRandomInt(0, affordableNow.length - 1)]; // e.g. "pekka"

//     // pick a focus point: random our unit OR null if none
//     // ,tlb oponent ke konse position ke pass spawn kru 
//     const focus = ourList.length ? ourList[getRandomInt(0, ourList.length - 1)] : null;

//     spawnWithAi(char, focus);

//     // small micro-delay between spawns (optional) to avoid all-in-one-frame
//     // (not blocking; just a tiny pause before next iteration)
//   }
// // GOTCHA / SUGGESTION

// // Right now you re-evaluate affordability each loop — good. But you do not reserve any elixir for defense (so AI may spend everything). Consider attackpower[k].elixir_needed <= current_elixiropp - reserve to keep a buffer.
  
// //   for(let player of activeplayers){
// //   if(player.opp === 'our'){
// //     ournew[player.id] = [player.x,player.y];
// //   // ournew ka bhar liya h humne
// //   }
// // }
// // // const stats = attackpower[type.toLowerCase()];
// // // const needed = attackpower[cardNameMap[id]].elixir_needed;
// //   for( let i of ournew ){
     
// //       const stats = cardNameMap[i].toLowerCase();
// //       // stats toh naam dedega 
// //       const nameOfChar = attackpower[stats];
// //       if(nameOfChar.elixir_needed< current_elixirour){
// //         spawnWithAi(stats);
// //       }

// //   }

// }
// // function spawnWithAi(char){
// //   x=ournew[0].x;
// //   y=ournew[0].y;

// //   if(y>350){
// //     //other side h toh hum x mathc krenge y nhi 
// //     y=y-200;
// //     makeActive(char,x,y,'our')
// //   }
// //   else{
// //     x=x-50;
// //     y=y-50;
// //     makeActive(char,x , y ,'our');
// //   }

// // }

// function spawnWithAi(char, focus) {
//   // char is like "pekka", "valkyrie", etc. makeActive expects type string.
//   let x, y;

//   if (focus) {
//     // Spawn roughly above/between the focus unit so AI pushes toward it.
//     // Give some horizontal jitter so AI doesn't stack perfectly.
//     x = focus.x + getRandomInt(-60, 60);
//     // uske upar ya niche khi pe bhi spawn hojaaye 

//     // Ensure opponent spawns on the top half (opponent area).
//     // We'll pick a y in opponent spawn range (100..300) or above the focus.
//     y = getRandomInt(100, 300);
//     // spawn 100 se 300 ke bich hi spawn ho 

//     // If focus is very close to top, nudge spawn a bit away
//     if (focus.y < 250) {
//       y = clamp(focus.y + getRandomInt(30, 80), 100, 300);
//       //iska mtlb  h y ai ke area me h toh ab hume itna random nhi krna h 
//       // mtllb woh value aisi aaye ki voh kese bhi krke 100 se 300 ke bich hi rahe 

//     }
//   } else {
//     // No friendly units on field — pick a random top-half spawn location
//     x = getRandomInt(60, canvas.width - playersize - 60);
//     // x khi bhi hoskta h us widht me agar huamra palyer abhi humari side hi h 
//     // 60 se lkeke canvaswidth 400 -playersize(60) - 60 tk khi pe bhi
//     y = getRandomInt(100, 300);
//     // and y 100 se 300 tk
//   }
//   // clam ka kaam hota h bich me fix krna 
//   // Clamp inside canvas & opponent allowed area
//   x = clamp(x, 0, canvas.width - playersize);
//   // Keep inside opponent area (top half). OPP_MAX_Y is defined earlier as 400
//   y = clamp(y, 0, Math.min(OPP_MAX_Y - playersize, canvas.height - playersize));
//   // yeh wala bhi y ko fix krdega 0 se leke kisis trh se toh krdega
//   // Make sure we only spawn if AI still has elixir; makeActive will subtract
//   const needed = attackpower[char].elixir_needed;
//   if (current_elixiropp >= needed) {
//     makeActive(char, x, y, 'opp'); // spawn as opponent
//   }
// }

// let aiSpawnTimerId = null;

// function scheduleAiSpawn() {
//   if (!ai_mode) return;
//   // pick random ms between 3000 and 5000
//   const delay = getRandomInt(3000, 5000);
//   aiSpawnTimerId = setTimeout(() => {
//     elexir_check();
//     // schedule next
//     scheduleAiSpawn();
//   }, delay);
// }

// function stopAiSpawn() {
//   if (aiSpawnTimerId) {
//     clearTimeout(aiSpawnTimerId);
//     aiSpawnTimerId = null;
//   }
// }

// function getRandomInt(min, max) {
//   // inclusive min, inclusive max
//   return Math.floor(Math.random() * (max - min + 1)) + min;
// }

// function clamp(v, a, b) {
//   return Math.max(a, Math.min(b, v));
// }

// ========================
// 🔹 AI Difficulty Settings
// ========================

// possible: "easy", "medium", "hard", "extreme"

// helper to easily toggle difficulty
function setAiDifficulty(level) {
  const allowed = ["easy", "medium", "hard", "extreme"];
  if (allowed.includes(level)) aiDifficulty = level;
  console.log("AI difficulty set to:", aiDifficulty);
}

// ====================================
// 🔹 Core AI Logic (Elixir Check + Spawn)
// ====================================
function elexir_check() {
  const ourList = activeplayers
    .filter(p => p.opp === 'our')
    .map(p => ({ id: p.id, x: p.x, y: p.y }));

  // ---------- Difficulty affects spawn count ----------
  let spawnRange;
  switch (aiDifficulty) {
    case "easy": spawnRange = [1, 1]; break;
    case "medium": spawnRange = [1, 2]; break;
    case "hard": spawnRange = [2, 3]; break;
    case "extreme": spawnRange = [2, 4]; break;
  }
  const spawnCount = getRandomInt(spawnRange[0], spawnRange[1]);

  // ---------- Difficulty affects elixir usage ----------
  let elixirReserve;
  switch (aiDifficulty) {
    case "easy": elixirReserve = 2; break;     // saves elixir, slower
    case "medium": elixirReserve = 1; break;
    //har bhi elexir reserve kare toh mene inhe bhi 2 krdiya
    case "hard": elixirReserve = 2; break;
    case "extreme": elixirReserve = 2; break; // -1 can overspend a bit
  }

  const affordableChars = Object.keys(attackpower).filter(
    k => attackpower[k].elixir_needed <= (current_elixiropp - elixirReserve)
  );

if (aiDifficulty === "hard" && current_elixiropp > 7) {
  // prefer high-cost cards
  affordableChars.sort((a, b) => attackpower[b].elixir_needed - attackpower[a].elixir_needed);
}
  if (affordableChars.length === 0) return;

  // ---------- Difficulty affects spawn targeting behavior ----------
  let focusBias; // % chance AI tries to target near your troops
  switch (aiDifficulty) {
    case "easy": focusBias = 0.3; break;     // 30% times near player
    case "medium": focusBias = 0.6; break;
    case "hard": focusBias = 0.8; break;
    case "extreme": focusBias = 1.0; break;  // always near player
  }

  for (let i = 0; i < spawnCount; i++) {
    const affordableNow = Object.keys(attackpower).filter(
      k => attackpower[k].elixir_needed <= (current_elixiropp - elixirReserve)
    );
    if (affordableNow.length === 0) break;

    // choose random card to spawn
    const char = affordableNow[getRandomInt(0, affordableNow.length - 1)];

    // choose focus based on bias
    let focus = null;
    if (ourList.length && Math.random() < focusBias) {
      focus = ourList[getRandomInt(0, ourList.length - 1)];
    }

    spawnWithAi(char, focus);
  }
}

// ====================================
// 🔹 AI Spawn Placement Logic
// ====================================
function spawnWithAi(char, focus) {
  let x, y;

  if (focus) {
    // try to spawn near target
    x = focus.x + getRandomInt(-60, 60);
    y = focus.y - getRandomInt(50, 100); // spawn slightly above target
  } else {
    // no focus — random in opponent area
    x = getRandomInt(60, canvas.width - playersize - 60);
    y = getRandomInt(100, 300);
  }

  // tighter spacing for higher difficulties
  const clampMargin = (aiDifficulty === "extreme") ? 20 : 0;

  x = clamp(x, 0 + clampMargin, canvas.width - playersize - clampMargin);
  y = clamp(y, 0 + clampMargin, Math.min(OPP_MAX_Y - playersize, canvas.height - playersize - clampMargin));

  const needed = attackpower[char].elixir_needed;
  if (current_elixiropp >= needed) {
    makeActive(char, x, y, 'opp');
  }
}

// ====================================
// 🔹 AI Spawn Scheduler (auto-runner)
// ====================================
let aiSpawnTimerId = null;

function scheduleAiSpawn() {
  if (!ai_mode) return;

  // difficulty affects reaction delay
  let delayRange;
  switch (aiDifficulty) {
    case "easy": delayRange = [5000, 7000]; break;
    case "medium": delayRange = [3000, 5000]; break;
    case "hard": delayRange = [2000, 3500]; break;
    case "extreme": delayRange = [1000, 2500]; break;
  }

  const delay = getRandomInt(delayRange[0], delayRange[1]);
  aiSpawnTimerId = setTimeout(() => {
    elexir_check();
    scheduleAiSpawn();
  }, delay);
}

function stopAiSpawn() {
  if (aiSpawnTimerId) {
    clearTimeout(aiSpawnTimerId);
    aiSpawnTimerId = null;
  }
}

// ====================================
// 🔹 Utility Functions
// ====================================
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// ====================================
// 🔹 In-Game Chat Feature (Multiplayer Only)
// ====================================
let chatMessages = []; // stores { sender: 'You' | 'Opponent', text: '...' }

function createChatUI() {
  if (!isMultiplayerMode) return; // only show in multiplayer
  if (document.getElementById('chatButton')) return; // already created

  // Chat toggle button (near deck, bottom-right)
  const chatBtn = document.createElement('button');
  chatBtn.id = 'chatButton';
  chatBtn.innerHTML = '💬';
  chatBtn.title = 'Open chat';
  Object.assign(chatBtn.style, {
    position: 'fixed',
    left: '20px',
    bottom: '80px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #00bfff, #0080ff)',
    color: '#fff',
    border: '3px solid #0066cc',
    fontSize: '24px',
    cursor: 'pointer',
    zIndex: 999998,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700'
  });

  chatBtn.addEventListener('click', () => {
    const modal = document.getElementById('chatModal');
    if (modal) {
      modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
      if (modal.style.display === 'flex') {
        // focus input when opening
        const input = document.getElementById('chatInput');
        if (input) input.focus();
      }
    }
  });

  document.body.appendChild(chatBtn);

  // Chat modal
  const chatModal = document.createElement('div');
  chatModal.id = 'chatModal';
  Object.assign(chatModal.style, {
    display: 'none',
    position: 'fixed',
    left: '20px',
    bottom: '140px',
    width: '320px',
    maxHeight: '400px',
    background: 'linear-gradient(180deg, rgba(10,10,10,0.98), rgba(20,20,20,0.98))',
    borderRadius: '14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
    border: '2px solid rgba(255,215,0,0.2)',
    zIndex: 999999,
    flexDirection: 'column',
    overflow: 'hidden'
  });

  // Header
  const chatHeader = document.createElement('div');
  chatHeader.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(255,215,0,0.1); border-bottom:2px solid rgba(255,215,0,0.3);">
      <span style="color:#ffd700; font-weight:800; font-size:16px;">💬 Chat</span>
      <button id="closeChatModal" style="background:transparent; border:none; color:#fff; font-size:20px; cursor:pointer; padding:0; line-height:1;">✕</button>
    </div>
  `;
  chatModal.appendChild(chatHeader);

  // Messages container
  const messagesContainer = document.createElement('div');
  messagesContainer.id = 'chatMessages';
  Object.assign(messagesContainer.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '12px',
    maxHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  });
  chatModal.appendChild(messagesContainer);

  // Input area
  const inputArea = document.createElement('div');
  inputArea.style.cssText = 'display:flex; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.05);';
  inputArea.innerHTML = `
    <input id="chatInput" type="text" placeholder="Type message..." maxlength="200" 
           style="flex:1; padding:8px 10px; border-radius:8px; border:2px solid rgba(255,215,0,0.2); background:rgba(255,255,255,0.05); color:#fff; outline:none; font-size:13px;" />
    <button id="sendChatBtn" style="padding:8px 14px; border-radius:8px; border:none; background:linear-gradient(135deg,#ffd700,#ffb300); color:#5a3a00; font-weight:700; cursor:pointer; font-size:13px;">Send</button>
  `;
  chatModal.appendChild(inputArea);

  document.body.appendChild(chatModal);

  // Wire close button
  const closeBtn = document.getElementById('closeChatModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chatModal.style.display = 'none';
    });
  }

  // Wire send button
  const sendBtn = document.getElementById('sendChatBtn');
  const chatInput = document.getElementById('chatInput');
  if (sendBtn && chatInput) {
    const sendMessage = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      if (!socket || !currentRoom) return;

      // Send to server
      socket.emit('chat_message', {
        room: currentRoom,
        text: text
      });

      // Add to local UI immediately (as 'You')
      addChatMessage('You', text);
      chatInput.value = '';
    };

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
}

function addChatMessage(sender, text) {
  chatMessages.push({ sender, text });

  const container = document.getElementById('chatMessages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  const isYou = sender === 'You';
  Object.assign(msgDiv.style, {
    padding: '8px 10px',
    borderRadius: '10px',
    background: isYou ? 'linear-gradient(135deg, rgba(0,191,255,0.15), rgba(0,128,255,0.1))' : 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,179,0,0.1))',
    border: isYou ? '1px solid rgba(0,191,255,0.3)' : '1px solid rgba(255,215,0,0.3)',
    alignSelf: isYou ? 'flex-end' : 'flex-start',
    maxWidth: '75%',
    wordWrap: 'break-word'
  });

  msgDiv.innerHTML = `
    <div style="font-size:11px; color:${isYou ? '#00bfff' : '#ffd700'}; font-weight:700; margin-bottom:3px;">${sender}</div>
    <div style="font-size:13px; color:#fff;">${escapeHtml(text)}</div>
  `;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight; // auto-scroll to bottom
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}




