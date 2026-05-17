const bcrypt = require('bcrypt');

async function generarHash() {
  const password = "Admin123";
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log("Contraseña: Admin123");
  console.log("Hash generado:", hash);
}

generarHash();