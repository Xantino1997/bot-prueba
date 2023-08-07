const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

// Importar librerías
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");

const {
  Client,
  LocalAuth,
  MessageType,
  MessageMedia,
} = require("whatsapp-web.js");
const axios = require("axios");

// Crear cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  // Incluir esta opción para permitir el formato de texto
  messageFormat: "HTML",
});

// Función para guardar los datos de pedidos vendidos por el administrador
function guardarPedidoAdmin(pedido) {
  adminPedidos.push(pedido);
}

// Variables para almacenar los pedidos vendidos por el administrador
let adminPedidos = [];
guardarPedidoAdmin(adminPedidos);

// Evento cuando se recibe un mensaje
client.on("message", async (message) => {
  console.log(message.body);

  // Si el mensaje es "*adminPedidos*", mostramos los pedidos vendidos por el administrador
  if (message.body.trim().toLowerCase() === "*adminpedidos*") {
    if (adminPedidos.length > 0) {
      let mensajeAdminPedidos = "Pedidos vendidos por el administrador:\n\n";
      adminPedidos.forEach((pedido, index) => {
        mensajeAdminPedidos += `${index + 1}. Número de pedido: ${
          pedido.orderNumber
        }\n`;
      });
      // Mostramos la cantidad de pizzas, bebidas y clientes del día anterior
      mensajeAdminPedidos += `\nCantidad de pizzas vendidas: ${adminPedidos.reduce(
        (total, pedido) => total + pedido.pizzas.length,
        0
      )}`;
      mensajeAdminPedidos += `\nCantidad de bebidas vendidas: ${adminPedidos.reduce(
        (total, pedido) => total + pedido.beverages.length,
        0
      )}`;
      mensajeAdminPedidos += `\nCantidad de clientes del día anterior: ${adminPedidos.length}`;

      await client.sendMessage(message.from, mensajeAdminPedidos);
    } else {
      await client.sendMessage(
        message.from,
        "No hay pedidos vendidos por el administrador."
      );
    }
    return;
  }
});

// Programar la tarea para reiniciar la lista de pedidos a las 14:10 todos los días
cron.schedule("20 14 * * *", () => {
  console.log("Reiniciando la lista de pedidos...");

  // Mostrar los pedidos vendidos antes de limpiar la lista
  if (adminPedidos.length > 0) {
    console.log("Pedidos vendidos antes de reiniciar la lista:");
    adminPedidos.forEach((pedido, index) => {
      console.log(`${index + 1}. Número de pedido: ${pedido.orderNumber}`);
    });
  } else {
    console.log("No hay pedidos vendidos por el administrador.");
  }

  // Guardar los pedidos vendidos en adminPedidos antes de limpiar la lista
  adminPedidos = adminPedidos.concat(customerQueue);

  // Lógica para reiniciar la lista de pedidos aquí
  customerQueue = [];
  customerCount = 0;
  usedOrderNumbers = [];
  console.log("Lista de pedidos reiniciada.");
});

// Variables para gestionar el flujo del chat
let hasSentGreeting = false;
let isOrderingPizza = false;
let isOrderingBeverages = false;
let isOrderingComplete = false;
let order = {
  pizzas: [],
  beverages: [],
};

// Lista de espera para clientes
let customerQueue = [];

// Contador de clientes
let customerCount = 0;

// Número máximo de clientes
const maxCustomers = 15;

// Lista de números de pedido utilizados
let usedOrderNumbers = [];

// Evento cuando se muestra el código QR
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

// Evento cuando el cliente de WhatsApp está listo
client.on("ready", () => {
  console.log("Conexión exitosa con Arturitus");
});

// Evento cuando se recibe un mensaje
client.on("message", async (message) => {
  console.log(message.body);

  // Si el mensaje es "hola", reiniciamos el ciclo de compra para un cliente nuevo
  if (message.body.toLowerCase() === "hola") {
    hasSentGreeting = false;
    isOrderingPizza = false;
    isOrderingBeverages = false;
    isOrderingComplete = false;
    order = {
      pizzas: [],
      beverages: [],
    };
  }

  // Si es la primera vez que el cliente envía un mensaje, le enviamos el saludo inicial
  if (!hasSentGreeting) {
    await enviarSaludo(message.from);
    hasSentGreeting = true;

    // Asignar un número de pedido único al cliente
    customerCount += 1;
    const customerOrderNumber = getUniqueOrderNumber();
    customerQueue.push({
      from: message.from,
      orderNumber: customerOrderNumber,
    });
  }

  // Si hay otros clientes en la lista de espera, enviamos un mensaje de espera
  if (customerQueue.length > 1 && customerQueue[0].from !== message.from) {
    await client.sendMessage(
      message.from,
      "Gracias por tu paciencia. Estamos procesando los datos. Por favor, espera unos momentos y vuelve a escribir hola ...⌛."
    );
    return;
  }

  // Procesamos el pedido del cliente actual
  const userMessage = message.body.toLowerCase();

  // Verificamos si se debe reiniciar la venta
  if (isOrderingComplete) {
    if (userMessage === "si") {
      const currentCustomer = customerQueue.shift();
      await client.sendMessage(
        currentCustomer.from,
        `¡Gracias por tu compra! Tu pedido con número ${currentCustomer.orderNumber} está en proceso. En breve te enviaremos tu pedido 👌.`
      );
    } else {
      const currentCustomer = customerQueue.shift();
      await client.sendMessage(
        currentCustomer.from,
        `¡Gracias por tu visita! Si deseas realizar una nueva orden, solo dímelo.`
      );
      resetearPedido(); // Reiniciamos estados y pedido
    }
    isOrderingComplete = false;
  }

  // Procesamos el pedido del cliente si está ordenando pizza
  if (isOrderingPizza) {
    const numeroPizza = parseInt(userMessage);
    if (
      !isNaN(numeroPizza) &&
      numeroPizza >= 1 &&
      numeroPizza <= listaPizzas.length
    ) {
      const pizzaSeleccionada = listaPizzas[numeroPizza - 1];
      order.pizzas.push(pizzaSeleccionada);
      await client.sendMessage(
        message.from,
        `Has seleccionado la ${pizzaSeleccionada.title}. ¿Deseas agregar alguna otra pizza? Responde con un número de 1 a 10, o 'no'.`
      );
    } else if (userMessage === "no") {
      if (order.pizzas.length > 0) {
        await enviarListaBebidas(message.from);
        isOrderingBeverages = true;
        isOrderingPizza = false;
      } else {
        await client.sendMessage(
          message.from,
          "Debes seleccionar al menos una pizza."
        );
      }
    } else {
      await client.sendMessage(
        message.from,
        "Por favor, ingresa un número válido de pizza del 1 al 10 o responde 'no' para finalizar el pedido."
      );
    }
  } else if (isOrderingBeverages) {
    // Procesamos el pedido del cliente si está ordenando bebidas
    const numeroBebida = parseInt(userMessage);
    if (
      !isNaN(numeroBebida) &&
      numeroBebida >= 1 &&
      numeroBebida <= listaBebidas.length
    ) {
      const bebidaSeleccionada = listaBebidas[numeroBebida - 1];
      order.beverages.push(bebidaSeleccionada);
      await client.sendMessage(
        message.from,
        `Has seleccionado ${bebidaSeleccionada.title}. ¿Quieres agregar alguna otra bebida? Responde con un número de 1 a 10, o 'no'.`
      );
    } else if (userMessage === "no") {
      await mostrarResumenPedido(message.from);
      isOrderingBeverages = false;
      isOrderingComplete = true;
    } else {
      await client.sendMessage(
        message.from,
        "Por favor, ingresa un número válido de bebida o responde 'no' para finalizar el pedido de bebidas."
      );
    }
  } else {
    // Si no está ordenando pizza o bebidas, mostramos el mensaje de inicio
    const clientesActivos =
      customerQueue.length > 0 ? customerQueue.length : "ninguno";
    let mensajeCliente = "";
    if (customerQueue.length === 1) {
      mensajeCliente =
        "¡Gracias por tu paciencia y elegirnos! . ¿Te gustaría ver de nuevo nuestra lista de pizzas y precios? \nResponde 'hola'";
    }
    await client.sendMessage(message.from, mensajeCliente);
  }
});

// Función para enviar el saludo inicial
async function enviarSaludo(chatId) {
  try {
    const gifUrl =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3l0SASy2lWAeI2v9R1dFbEgN06WihgVjCWA&usqp=CAU";
    const response = await axios.get(gifUrl, { responseType: "arraybuffer" });
    const base64String = Buffer.from(response.data, "binary").toString(
      "base64"
    );
    const mensajeMedia = new MessageMedia("image/gif", base64String);

    await client.sendMessage(
      chatId,
      "¡Hola soy ```Arturito``` estoy aquí para ayudarte!\n _*Te muestro lista de pizzas y precios*_ 🍕",
      { media: mensajeMedia }
    );

    await enviarListaPizzas(chatId);
    isOrderingPizza = true;
  } catch (error) {
    console.error("Error al enviar el saludo:", error);
  }
}

// Función para enviar la lista de pizzas
async function enviarListaPizzas(chatId) {
  try {
    await client.sendMessage(
      chatId,
      "Aquí tienes nuestra lista de pizzas disponibles: 🤤\n"
    );

    for (const [index, pizza] of listaPizzas.entries()) {
      // Agregar un retraso de 1 segundo por cada pizza para evitar enviar mensajes muy rápidos
      await new Promise((resolve) => setTimeout(resolve,100));
      await client.sendMessage(
        chatId,
        `${index + 1}. *${pizza.title}*\n\nDescripción: ${
          pizza.Ingredientes
        }\nPrecio: $${pizza.price} ${pizza.currency} ${pizza.image}`
      );
    }

    await client.sendMessage(
      chatId,
      "Elige una de las opciones de arriba escribiendo el número correspondiente a la pizza que desees"
    );
  } catch (error) {
    console.error("Error al enviar la lista de pizzas:", error);
  }
}

// Función para enviar la lista de bebidas
async function enviarListaBebidas(chatId) {
  try {
    await client.sendMessage(
      chatId,
      "Ahora aquí tienes nuestra lista de bebidas disponibles: 😉\n"
    );

    for (const [index, bebida] of listaBebidas.entries()) {
      // Agregar un retraso de 1 segundo por cada bebida para evitar enviar mensajes muy rápidos
      await new Promise((resolve) => setTimeout(resolve, 100));
      await client.sendMessage(
        chatId,
        `${index + 1}. *${bebida.title}*\n\nDescripción: ${
          bebida.description
        }\nPrecio: $${bebida.price} ${bebida.currency} ${bebida.image}\n`
      );
    }

    await client.sendMessage(
      chatId,
      "Por favor, elige una de las siguientes opciones escribiendo el número correspondiente de 1 a 10 \no 'no' para finalizar la compra 😎"
    );
  } catch (error) {
    console.error("Error al enviar la lista de bebidas:", error);
  }
}

// Función para mostrar el resumen del pedido
async function mostrarResumenPedido(chatId) {
  try {
    let mensajeResumen = "Has ordenado lo siguiente:\n\n";
    order.pizzas.forEach((pizza, index) => {
      mensajeResumen += `${index + 1}. ${pizza.title}\n`;
    });

    order.beverages.forEach((bebida, index) => {
      mensajeResumen += `${index + 1}. ${bebida.title}\n`;
    });

    let total = 0;
    order.pizzas.forEach((pizza) => {
      total += pizza.price;
    });
    order.beverages.forEach((bebida) => {
      total += bebida.price;
    });

    mensajeResumen += `--------------------\n*Total a pagar: $${total} Pesos*\n`;
    const currentCustomer = customerQueue[0];
    mensajeResumen +=
      `-------------------------------\nGracias por tu pedido! Tu pedido se guardó con el número ${currentCustomer.orderNumber}.
      \n-------------------` +
      "\n¿Deseas confirmar tu pedido? Responde 'si' para confirmar o cualquier otro mensaje para cancelar.";

    await client.sendMessage(chatId, mensajeResumen);
  } catch (error) {
    console.error("Error al mostrar el resumen de la compra:", error);
  }
}

// Función para reiniciar el pedido
function resetearPedido() {
  // Reiniciar los estados y el pedido
  hasSentGreeting = false;
  isOrderingPizza = false;
  isOrderingBeverages = false;
  isOrderingComplete = false;
  order = {
    pizzas: [],
    beverages: [],
  };
}

// Función para obtener un número de pedido único
function getUniqueOrderNumber() {
  let orderNumber = customerCount;
  while (usedOrderNumbers.includes(orderNumber)) {
    orderNumber++;
  }
  usedOrderNumbers.push(orderNumber);
  return orderNumber;
}

const listaPizzas = [
  {
    title: "```Pizza Clásica```",
    Ingredientes: "Queso, tomate y orégano",
    price: 1100,
    currency: "Pesos",
    image: "🍕",
  },
  {
    title: "```Pizza Hawaiana```",
    Ingredientes: "Jamón y piña",
    price:1350,
    currency: "Pesos",
    image: "🍍🍕",
  },
  {
    title: "```Pizza Pepperoni```",
    Ingredientes: "Queso y pepperoni",
    price: 1100,
    currency: "Pesos",
    image: "🍕🌶️",
  },
  {
    title: "```Pizza Vegetariana```",
    Ingredientes: "Queso, tomate, champiñones, pimientos y aceitunas",
    price: 1300,
    currency: "Pesos",
    image: "🍕🥬",
  },
  {
    title: "```Pizza Mexicana```",
    Ingredientes: "Queso, carne de res, jalapeños y guacamole",
    price: 1500,
    currency: "Pesos",
    image: "🍕🌮",
  },
  {
    title: "```Pizza Barbacoa```",
    Ingredientes: "Carne de res, cebolla, pimientos y salsa barbacoa",
    price: 1085,
    currency: "Pesos",
    image: "🍕🍖",
  },
  {
    title: "```Pizza Cuatro Quesos```",
    Ingredientes: " Queso azul, queso brie, queso de cabra y queso mozzarella",
    price: 1400,
    currency: "Pesos",
    image: "🍕🧀",
  },
  {
    title: "```Pizza Margherita```",
    Ingredientes: "Queso mozzarella, tomate y albahaca",
    price: 1500,
    currency: "Pesos",
    image: "🍕🍅",
  },
  {
    title: "```Pizza Romana```",
    Ingredientes: "Queso, jamón serrano y rúcula",
    price: 1300,
    currency: "Pesos",
    image: "🍕🍖",
  },
  {
    title: "```Pizza Calzone```",
    Ingredientes: " Queso, pepperoni y tomate, cerrada en forma de empanada",
    price: 780,
    currency: "Pesos",
    image: "🍕🥟",
  },
];

const listaBebidas = [
  {
    title: "```Refresco de Cola```",
    description: "Refresco de cola",
    price: 1500,
    currency: "Pesos",
    image: "🥤",
  },
  {
    title: "```Jugo de Naranja```",
    description: "Jugo natural de naranja",
    price: 300,
    currency: "Pesos",
    image: "🍊",
  },
  {
    title: "```Agua Mineral```",
    description: "Agua mineral sin gas",
    price: 220,
    currency: "Pesos",
    image: "🚰",
  },
  {
    title: "```Cerveza```",
    description: "Cerveza fría",
    price: 500,
    currency: "Pesos",
    image: "🍺",
  },
  {
    title: "```Té Helado```",
    description: "Té helado con limón",
    price: 450,
    currency: "Pesos",
    image: "🍹",
  },
  {
    title: "```Café```",
    description: "Café negro o con leche",
    price: 330,
    currency: "```Pesos```",
    image: "☕",
  },
  {
    title: "```Batido de Frutas```",
    description: "Batido de frutas variadas",
    price: 400,
    currency: "Pesos",
    image: "🥤🍓🍌",
  },
  {
    title: "```Agua con Gas```",
    description: "Agua con gas natural",
    price: 350,
    currency: "Pesos",
    image: "🚰🔺",
  },
  {
    title: "```Vino Tinto```",
    description: "Vino tinto de la casa",
    price: 400,
    currency: "Pesos",
    image: "🍷",
  },
  {
    title: "```Limonada```",
    description: "Limonada casera",
    price: 350,
    currency: "Pesos",
    image: "🍋🥤",
  },
];

client.initialize();

// Iniciar el servidor
app.listen(port, () => {
  console.log(`La aplicación está escuchando en http://localhost:`);
});






