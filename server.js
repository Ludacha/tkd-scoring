const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);


app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/marcador.html');
});

// Estado inicial del combate
let combate = {
    ronda: 1,
    tiempo: 60,
    puntos: { rojo: 0, azul: 0 },
    enMarcha: false
};

let intervaloRonda = null; // Guardar setInterval global
let votaciones = []; // Array de votaciones en curso: { jugador, puntos, votos: [juezId], timeoutId }

// Función de conteo de tiempo
function iniciarRonda() {
    if (combate.enMarcha) return;
    combate.enMarcha = true;
    intervaloRonda = setInterval(() => {
        if (combate.tiempo > 0) {
            combate.tiempo--;
            io.emit('update', combate);
        } else {
            clearInterval(intervaloRonda);
            combate.enMarcha = false;
            io.emit('rondaFinalizada', combate.ronda);
        }
    }, 1000);
}

// Conexión de clientes
io.on('connection', (socket) => {
    socket.emit('update', combate);

    // --- Evento de punto con votación por tiempo límite ---
    socket.on('punto', (data) => {
        // Buscar votación existente para ese jugador/punto
        let votacion = votaciones.find(v => v.jugador === data.jugador && v.puntos === data.puntos);

        if (!votacion) {
            // Crear nueva votación
            votacion = { jugador: data.jugador, puntos: data.puntos, votos: [socket.id], timeoutId: null };

            // Iniciar temporizador de votación (3 segundos)
            votacion.timeoutId = setTimeout(() => {
                if (votacion.votos.length >= 2) {
                    combate.puntos[votacion.jugador] += votacion.puntos;
                    io.emit('update', combate);
                }
                // Eliminar votación ya evaluada
                votaciones = votaciones.filter(v => v !== votacion);
            }, 2000); // tiempo límite en ms

            votaciones.push(votacion);
        } else {
            // Agregar voto si el juez aún no votó
            if (!votacion.votos.includes(socket.id)) {
                votacion.votos.push(socket.id);
            }
        }
    });

    // --- Reset de combate ---
    socket.on('reset', () => {
        combate = { ronda: 1, tiempo: 60, puntos: { rojo: 0, azul: 0 }, enMarcha: false };
        clearInterval(intervaloRonda);
        // Limpiar todas las votaciones activas
        votaciones.forEach(v => clearTimeout(v.timeoutId));
        votaciones = [];
        io.emit('update', combate);
    });

    // --- Iniciar ronda ---
    socket.on('iniciarRonda', () => {
        combate.tiempo = 60;
        iniciarRonda();
    });

    // --- Siguiente ronda ---
    socket.on('siguienteRonda', () => {
        if (combate.enMarcha) return;
        combate.ronda++;
        combate.tiempo = 60;
        combate.puntos = { rojo: 0, azul: 0 };
        // Limpiar votaciones pendientes
        votaciones.forEach(v => clearTimeout(v.timeoutId));
        votaciones = [];
        io.emit('update', combate);
    });

    // --- Pausar y continuar ---
    socket.on('pausarRonda', () => {
        clearInterval(intervaloRonda);
        combate.enMarcha = false;
        io.emit('update', combate);
    });

    socket.on('continuarRonda', () => {
        if (combate.enMarcha) return;
        iniciarRonda();
    });

    // --- Limpiar votos si un juez se desconecta ---
    socket.on('disconnect', () => {
        votaciones.forEach(v => {
            v.votos = v.votos.filter(juezId => juezId !== socket.id);
        });
    });
});

http.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));
