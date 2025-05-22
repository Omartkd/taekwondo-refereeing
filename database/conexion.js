const sqlite3 = require ('sqlite3');

const db = sqlite3.createConnection (
    {
    host: '3000',
    user: 'clientes',
    password: 'Herber%6',
    database: 'clientes',
    }
);

db.connect ((err) => {
 if (err)   {
    throw err;
    }
    console.log('base de datos conectada');
})

module.exports =db;
