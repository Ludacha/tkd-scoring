const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000; // Render asigna automáticamente el puerto

// Servir carpeta pública
app.use(express.static("public"));

// Página principal: marcador
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/marcador.html");
});

// Estado inicial del combate
let combate = {
  ronda: 1,
  tiempo: 60,
  puntos: { rojo: 0, azul: 0 },
  enMarcha: false,
};

let intervaloRonda = null; // Guardar setInterval global
let votaciones = []; // { jugador, puntos, votos: [juezId], timeoutId }

// Función de conteo de tiempo
function iniciarRonda() {
  if (combate.enMarcha) return;
  combate.enMarcha = true;
  intervaloRonda = setInterval(() => {
    if (combate.tiempo > 0) {
      combate.tiempo--;
      io.emit("update", combate);
    } else {
      clearInterval(intervaloRonda);
      combate.enMarcha = false;
      io.emit("rondaFinalizada", combate.ronda);
    }
  }, 1000);
}

// Conexión de clientes
io.on("connection", (socket) => {
  // Enviar estado inicial
  socket.emit("update", combate);

  // --- Puntos con votación de jueces ---
  socket.on("punto", (data) => {
    let votacion = votaciones.find(
      (v) => v.jugador === data.jugador && v.puntos === data.puntos
    );

    if (!votacion) {
      votacion = {
        jugador: data.jugador,
        puntos: data.puntos,
        votos: [socket.id],
        timeoutId: null,
      };

      votacion.timeoutId = setTimeout(() => {
        if (votacion.votos.length >= 2) {
          combate.puntos[votacion.jugador] += votacion.puntos;
          io.emit("update", combate);
        }
        votaciones = votaciones.filter((v) => v !== votacion);
      }, 2000);

      votaciones.push(votacion);
    } else if (!votacion.votos.includes(socket.id)) {
      votacion.votos.push(socket.id);
    }
  });

  // --- Puntos directos desde el marcador central (+1, +2, -1) ---
    socket.on("puntos", (data) => {
    const { jugador, puntos } = data;

    // Evitar que el marcador sea negativo
    combate.puntos[jugador] = Math.max(combate.puntos[jugador] + puntos, 0);

    // Emitir actualización a todos los clientes
    io.emit("update", combate);
  });


  // --- Reset de combate ---
  socket.on("reset", () => {
    combate = {
      ronda: 1,
      tiempo: 60,
      puntos: { rojo: 0, azul: 0 },
      enMarcha: false,
    };
    clearInterval(intervaloRonda);
    votaciones.forEach((v) => clearTimeout(v.timeoutId));
    votaciones = [];
    io.emit("update", combate);
  });

  // --- Iniciar ronda ---
  socket.on("iniciarRonda", () => {
    combate.tiempo = 60;
    iniciarRonda();
  });

  // --- Siguiente ronda ---
  socket.on("siguienteRonda", () => {
    if (combate.enMarcha) return;
    combate.ronda++;
    combate.tiempo = 60;
    combate.puntos = { rojo: 0, azul: 0 };
    votaciones.forEach((v) => clearTimeout(v.timeoutId));
    votaciones = [];
    io.emit("update", combate);
  });

  // --- Pausar y continuar ---
  socket.on("pausarRonda", () => {
    clearInterval(intervaloRonda);
    combate.enMarcha = false;
    io.emit("update", combate);
  });

  socket.on("continuarRonda", () => {
    if (combate.enMarcha) return;
    iniciarRonda();
  });

  // --- Cuando un juez se desconecta ---
  socket.on("disconnect", () => {
    votaciones.forEach((v) => {
      v.votos = v.votos.filter((juezId) => juezId !== socket.id);
    });
  });
});

// Escuchar puerto (Render)
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
