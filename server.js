const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(__dirname));

const ANIMALS_100 = [
    "개", "고양이", "호랑이", "사자", "코끼리", "기린", "얼룩말", "곰", "늑대", "여우",
    "토끼", "다람쥐", "원숭이", "고릴라", "침팬지", "오랑우탄", "판다", "캥거루", "코알라", "하마",
    "코뿔소", "사슴", "순록", "낙타", "라마", "알파카", "소", "돼지", "말", "양",
    "염소", "당나귀", "카피바라", "햄스터", "비버", "고슴도치", "수달", "바다표범", "물개", "바다코끼리",
    "돌고래", "고래", "상어", "가오리", "오징어", "문어", "참치", "수리부엉이", "도롱뇽", "거북",
    "악어", "도마뱀", "카멜레온", "뱀", "이구아나", "향고래", "일각고래", "뉴트", "독수리", "매",
    "올빼미", "부엉이", "참새", "비둘기", "까마귀", "까치", "제비", "뻐꾸기", "앵무새", "공작",
    "닭", "오리", "거위", "타조", "펭귄", "플라밍고", "두루미", "백로", "갈매기", "펠리컨",
    "치타", "표범", "재규어", "하이에나", "미어캣", "너구리", "오카피", "나무늘보", "아르마딜로", "오리너구리",
    "타마린", "족제비", "담비", "스컹크", "두더지", "바다거북", "퓨마", "날다람쥐", "재칼", "백조"
];

// Color generation helper per animal
function getRandomColor(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return "0x" + "000000".substring(0, 6 - c.length) + c;
}

// Generate randomized stats for each 100 animals
const ANIMAL_STATS = {};
ANIMALS_100.forEach((name) => {
    const isRanged = Math.random() < 0.35;
    const isCharge = !isRanged && Math.random() < 0.4;
    ANIMAL_STATS[name] = {
        name,
        hp: Math.floor(Math.random() * 120) + 80,
        atk: Math.floor(Math.random() * 25) + 10,
        speed: isCharge ? (Math.random() * 2 + 5.5) : (Math.random() * 1.5 + 3),
        range: isRanged ? (Math.random() * 10 + 12) : 2.5,
        isRanged,
        isCharge,
        color: parseInt(getRandomColor(name), 16),
        scale: Math.random() * 0.6 + 0.8
    };
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join_room', () => {
        let roomId = null;
        for (let id in rooms) {
            if (Object.keys(rooms[id].players).length < 2 && !rooms[id].started) {
                roomId = id;
                break;
            }
        }

        if (!roomId) {
            roomId = 'room_' + Math.random().toString(36).substring(2, 9);
            rooms[roomId] = {
                players: {},
                readyCount: 0,
                started: false,
                countdownTimer: null
            };
        }

        const room = rooms[roomId];
        const playerNum = Object.keys(room.players).length === 0 ? 1 : 2;
        room.players[socket.id] = {
            id: socket.id,
            num: playerNum,
            ready: false
        };

        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit('assigned_player', { playerNum, roomId });
        io.to(roomId).emit('room_status', {
            count: Object.keys(room.players).length,
            players: room.players
        });
    });

    socket.on('toggle_ready', () => {
        const room = rooms[socket.roomId];
        if (!room || room.started) return;

        const player = room.players[socket.id];
        if (player) {
            player.ready = !player.ready;
            
            const allReady = Object.keys(room.players).length === 2 &&
                Object.values(room.players).every(p => p.ready);

            io.to(socket.roomId).emit('room_status', {
                count: Object.keys(room.players).length,
                players: room.players
            });

            if (allReady) {
                let count = 3;
                io.to(socket.roomId).emit('countdown', count);
                room.countdownTimer = setInterval(() => {
                    count--;
                    if (count > 0) {
                        io.to(socket.roomId).emit('countdown', count);
                    } else {
                        clearInterval(room.countdownTimer);
                        room.started = true;
                        io.to(socket.roomId).emit('game_start');
                    }
                }, 1000);
            } else if (room.countdownTimer) {
                clearInterval(room.countdownTimer);
                room.countdownTimer = null;
                io.to(socket.roomId).emit('countdown_cancelled');
            }
        }
    });

    socket.on('spawn_animal', () => {
        const room = rooms[socket.roomId];
        if (!room || !room.started) return;

        const player = room.players[socket.id];
        if (!player) return;

        const randomName = ANIMALS_100[Math.floor(Math.random() * ANIMALS_100.length)];
        const stats = ANIMAL_STATS[randomName];
        const spawnId = 'unit_' + Math.random().toString(36).substring(2, 9);

        io.to(socket.roomId).emit('animal_spawned', {
            id: spawnId,
            owner: player.num,
            stats: stats
        });
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            delete room.players[socket.id];
            if (room.countdownTimer) clearInterval(room.countdownTimer);

            if (Object.keys(room.players).length === 0) {
                delete rooms[roomId];
            } else {
                room.started = false;
                io.to(roomId).emit('player_left');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});