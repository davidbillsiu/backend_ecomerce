const { Sequelize } = require('sequelize');

const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
const opts = { dialect: 'mysql', logging: false, define: { timestamps: false, freezeTableName: true } };

const sequelize = url
  ? new Sequelize(url, opts)
  : new Sequelize(process.env.DB_NAME || 'moveis_db', process.env.DB_USER || 'root', process.env.DB_PASS || '', {
      ...opts,
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
    });

module.exports = sequelize;
