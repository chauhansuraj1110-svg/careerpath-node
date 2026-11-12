// Dummy data for testing every flow. Safe to re-run (existing rows are skipped).
// Run: node seed.js      Passwords for all dummy users: Test@123
const { init, q, hash } = require('./db');
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const seekers = [
  ['raj', 'Raj', 'Sharma', 'raj@gmail.com', 'B.E.', 'Computer Science', 'Java', 'SQL', 'Pune'],
  ['priya', 'Priya', 'Patil', 'priya@gmail.com', 'MCA', 'Software Engineering', 'JavaScript', 'Python', 'Mumbai'],
  ['amit', 'Amit', 'Verma', 'amit@gmail.com', 'MBA', 'Finance', 'SQL', 'C#', 'Mumbai'],
];
const recruiters = [
  ['rec1', 'TechNova Solutions', 'IT Services', 'hr@technova.com', 'Pune'],
  ['rec2', 'FinEdge Consulting', 'Finance', 'jobs@finedge.com', 'Mumbai'],
];
const jobs = [
  ['rec1', 'TN-001', 'Software Development', 'Java, SQL', 'Java Developer', 'B.E.', '3-5 Years', '600000', 'Pune'],
  ['rec1', 'TN-002', 'Software Development', 'JavaScript, Python', 'Full Stack Developer', 'MCA', '1-3 Years', '500000', 'Pune'],
  ['rec1', 'TN-003', 'Testing', 'SQL', 'QA Engineer', 'B.Sc', 'Fresher', '300000', 'Mumbai'],
  ['rec2', 'FE-001', 'Finance', 'SQL', 'Financial Analyst', 'MBA', '1-3 Years', '550000', 'Mumbai'],
  ['rec2', 'FE-002', 'HR', '', 'HR Executive', 'MBA', 'Fresher', '350000', 'Mumbai'],
];
const applications = [['raj', 'rec1', 'TN-001'], ['raj', 'rec1', 'TN-002'], ['priya', 'rec1', 'TN-002'], ['priya', 'rec2', 'FE-001'], ['amit', 'rec2', 'FE-001'], ['amit', 'rec2', 'FE-002']];

(async () => {
  await init();
  const pw = hash('Test@123');
  for (const [u, f, l, email, deg, spec, s1, s2, city] of seekers) {
    if (await q.get('SELECT 1 x FROM jobseekers WHERE user_id=?', u)) continue;
    await q.run(`INSERT INTO jobseekers (user_id,password,hint_question,answer,reg_date,first_name,last_name,email,phone1,city,state,country,highest_degree,specialisation,passing_year,percentage,university,technical_exp,job_title,skill1,skill1_year,skill2,skill2_year,resume,resume_uploaded,resume_modified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      u, pw, 'Pet name?', 'tommy', d(-10), f, l, email, '9000000000', city, 'Maharashtra', 'India', deg, spec, '2022', '75', 'Pune University', '1-3 Years', 'Software Engineer', s1, '2', s2, '1', `${f} ${l} - resume. Skills: ${s1}, ${s2}.`, d(-10), d(-5));
  }
  for (const [u, org, sector, email, ] of recruiters) {
    if (await q.get('SELECT 1 x FROM recruiters WHERE username=?', u)) continue;
    await q.run('INSERT INTO recruiters (username,password,hint_question,answer,reg_date,org_name,business_sector,website,email1,address,org_size) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      u, pw, 'Pet name?', 'tommy', d(-20), org, sector, 'https://example.com', email, 'Maharashtra, India', 50);
  }
  for (const [u, jid, cat, skills, role, qual, exp, sal, loc] of jobs) {
    if (await q.get('SELECT 1 x FROM jobs WHERE username=? AND job_id=?', u, jid)) continue;
    await q.run('INSERT INTO jobs (username,job_id,category,skills_required,role,min_qualification,max_age,experience_years,expected_salary,location,opening_date,closing_date,description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      u, jid, cat, skills, role, qual, 40, exp, sal, loc, d(-7), d(30), `Dummy opening for ${role}.`);
  }
  for (const [u, r, j] of applications)
    await q.run('INSERT IGNORE INTO applications (user_id,recruiter,job_id,applied_date) VALUES (?,?,?,?)', u, r, j, d(-2));
  if (!(await q.get('SELECT 1 x FROM feedback LIMIT 1'))) await q.run('INSERT INTO feedback (name,email,message,created) VALUES (?,?,?,?)', 'Raj Sharma', 'raj@gmail.com', 'Great portal!', d(-1));
  if (!(await q.get('SELECT 1 x FROM mails LIMIT 1'))) await q.run('INSERT INTO mails (sender,recipient,subject,body,created) VALUES (?,?,?,?,?)', 'rec1', 'raj@gmail.com', 'Interview invite', 'Please attend an interview on Monday.', d(-1));
  console.log('Seed done.'); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
