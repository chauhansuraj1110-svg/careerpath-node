/**
 * CareerPath - MySQL data layer (mysql2).
 *
 *   init()          creates the database + tables on first run and seeds the admin login and sample master data
 *   q.all/get/run   async query helpers (parameters use ? placeholders; undefined is stored as NULL)
 *   hash / verify   scrypt password hashing (passwords are never stored in plain text)
 *
 * Connection settings come from environment variables or the .env file (see .env.example).
 */
const mysql = require('mysql2/promise');
const crypto = require('node:crypto');
const path = require('node:path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env is optional */ }

const cfg = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'careerpath',
};

let pool; // connection pool, created in init()
const nz = (p) => p.map((v) => (v === undefined ? null : v));
// all -> array of rows | get -> first row or undefined | run -> result header (insertId, affectedRows)
const q = {
  all: async (sql, ...p) => (await pool.query(sql, nz(p)))[0],
  get: async (sql, ...p) => (await pool.query(sql, nz(p)))[0][0],
  run: async (sql, ...p) => (await pool.query(sql, nz(p)))[0], // ResultSetHeader: insertId, affectedRows
};

// Passwords are stored as scrypt hashes (the original stored plain text).
function hash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function verify(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Table options. Dates are stored as 'YYYY-MM-DD' text; foreign keys cascade so deleting a user removes their data.
const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
// Table definitions (CREATE TABLE IF NOT EXISTS, so it is safe to run on every start).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS countries (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255)) ${T}`,
  `CREATE TABLE IF NOT EXISTS states (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255),
    country_id INT NOT NULL, FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS cities (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255),
    state_id INT NOT NULL, FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS experiences (id INT AUTO_INCREMENT PRIMARY KEY, exp_type VARCHAR(100) NOT NULL, duration VARCHAR(100)) ${T}`,
  `CREATE TABLE IF NOT EXISTS functional_areas (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255)) ${T}`,
  `CREATE TABLE IF NOT EXISTS job_types (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255)) ${T}`,
  `CREATE TABLE IF NOT EXISTS qualifications (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255), level VARCHAR(100)) ${T}`,
  `CREATE TABLE IF NOT EXISTS skills (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255)) ${T}`,
  `CREATE TABLE IF NOT EXISTS admins (username VARCHAR(100) PRIMARY KEY, password VARCHAR(255) NOT NULL) ${T}`,
  `CREATE TABLE IF NOT EXISTS jobseekers (
    user_id VARCHAR(100) PRIMARY KEY, password VARCHAR(255) NOT NULL, hint_question VARCHAR(255), answer VARCHAR(255), reg_date VARCHAR(10),
    first_name VARCHAR(100), last_name VARCHAR(100), dob VARCHAR(10), address TEXT, city VARCHAR(100), state VARCHAR(100), pin_code VARCHAR(20), country VARCHAR(100),
    email VARCHAR(150), phone1 VARCHAR(30), phone2 VARCHAR(30), fax VARCHAR(30),
    highest_degree VARCHAR(100), specialisation VARCHAR(150), passing_year VARCHAR(10), percentage VARCHAR(20), university VARCHAR(150), bg_country VARCHAR(100),
    technical_exp VARCHAR(100), work_field VARCHAR(100),
    job_title VARCHAR(150), location1 VARCHAR(100), state1 VARCHAR(100), country1 VARCHAR(100), location2 VARCHAR(100), state2 VARCHAR(100), country2 VARCHAR(100),
    will_relocate TINYINT DEFAULT 0, will_telecommute TINYINT DEFAULT 0, will_travel TINYINT DEFAULT 0,
    full_time_salary VARCHAR(50), hourly_salary VARCHAR(50), emp_type1 VARCHAR(100), emp_type2 VARCHAR(100), emp_type3 VARCHAR(100),
    skill1 VARCHAR(100), skill1_year VARCHAR(20), skill1_last VARCHAR(20), skill2 VARCHAR(100), skill2_year VARCHAR(20), skill2_last VARCHAR(20),
    skill3 VARCHAR(100), skill3_year VARCHAR(20), skill3_last VARCHAR(20), skill4 VARCHAR(100), skill4_year VARCHAR(20), skill4_last VARCHAR(20),
    resume MEDIUMTEXT, resume_uploaded VARCHAR(10), resume_modified VARCHAR(10)) ${T}`,
  `CREATE TABLE IF NOT EXISTS recruiters (
    username VARCHAR(100) PRIMARY KEY, password VARCHAR(255) NOT NULL, hint_question VARCHAR(255), answer VARCHAR(255), reg_date VARCHAR(10),
    org_name VARCHAR(150), business_sector VARCHAR(150), certificate1 VARCHAR(150), certificate2 VARCHAR(150), certificate3 VARCHAR(150), website VARCHAR(200),
    email1 VARCHAR(150), email2 VARCHAR(150), address TEXT, org_environment TEXT, terms TEXT, others VARCHAR(255), org_size INT) ${T}`,
  `CREATE TABLE IF NOT EXISTS jobs (
    sno INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL, job_id VARCHAR(100) NOT NULL, category VARCHAR(100), skills_required VARCHAR(255),
    role VARCHAR(100), min_qualification VARCHAR(100), max_age INT, experience_years VARCHAR(50), expected_salary VARCHAR(50), location VARCHAR(150),
    opening_date VARCHAR(10), closing_date VARCHAR(10), description TEXT,
    FOREIGN KEY (username) REFERENCES recruiters(username) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS applications (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(100) NOT NULL, recruiter VARCHAR(100) NOT NULL, job_id VARCHAR(100) NOT NULL, applied_date VARCHAR(10),
    UNIQUE KEY uq_app (user_id, recruiter, job_id), FOREIGN KEY (user_id) REFERENCES jobseekers(user_id) ON DELETE CASCADE) ${T}`,
  `CREATE TABLE IF NOT EXISTS feedback (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150), email VARCHAR(150), message TEXT, created VARCHAR(10)) ${T}`,
  `CREATE TABLE IF NOT EXISTS mails (id INT AUTO_INCREMENT PRIMARY KEY, sender VARCHAR(100), recipient VARCHAR(150), subject VARCHAR(255), body TEXT, created VARCHAR(10)) ${T}`,
];

async function init() {
  // 1) make sure the database exists, 2) open the pool, 3) create tables, 4) seed first-run data
  const boot = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4`);
  await boot.end();
  pool = mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4' });
  for (const ddl of SCHEMA) await pool.query(ddl);

  if (!(await q.get('SELECT 1 x FROM admins LIMIT 1'))) {
    await q.run('INSERT INTO admins VALUES (?,?)', 'admin', hash('admin123'));
    const c = (await q.run('INSERT INTO countries (name,description) VALUES (?,?)', 'India', 'India')).insertId;
    const s = (await q.run('INSERT INTO states (name,description,country_id) VALUES (?,?,?)', 'Maharashtra', '', c)).insertId;
    await q.run('INSERT INTO cities (name,description,state_id) VALUES (?,?,?)', 'Mumbai', '', s);
    await q.run('INSERT INTO cities (name,description,state_id) VALUES (?,?,?)', 'Pune', '', s);
    for (const n of ['Software Development', 'Testing', 'Sales', 'Finance', 'HR']) await q.run('INSERT INTO functional_areas (name,description) VALUES (?,?)', n, '');
    for (const n of ['Full Time', 'Part Time', 'Contract']) await q.run('INSERT INTO job_types (name,description) VALUES (?,?)', n, '');
    for (const n of ['B.E.', 'B.Sc', 'M.Sc', 'MBA', 'MCA']) await q.run('INSERT INTO qualifications (name,description,level) VALUES (?,?,?)', n, '', '');
    for (const [t, d] of [['Fresher', '0 years'], ['1-3 Years', '1 to 3'], ['3-5 Years', '3 to 5'], ['5+ Years', '5 or more']]) await q.run('INSERT INTO experiences (exp_type,duration) VALUES (?,?)', t, d);
    for (const n of ['Java', 'C#', 'JavaScript', 'SQL', 'Python']) await q.run('INSERT INTO skills (name,description) VALUES (?,?)', n, '');
  }
}

module.exports = { init, q, hash, verify, cfg };
