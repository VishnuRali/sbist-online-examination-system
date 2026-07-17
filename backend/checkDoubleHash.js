const bcrypt = require('bcryptjs');

const targetHash = '$2a$12$2roz.11IGCEhQ5e8wb3Fte/lF0TBjCr5SFR.KOz5Z3Fv49hbf/NwK';
const password = 'Nikhil1234';

async function run() {
  // Test direct compare
  const directMatch = await bcrypt.compare(password, targetHash);
  console.log(`Direct compare match: ${directMatch}`);

  // Test double hash compare
  // If it was double hashed, the student.password set in the controller was the hashed value:
  // e.g. controller did student.password = await bcrypt.hash(newPassword, 12) (or similar) or student.password was already a hash
  // and the pre-save hook hashed it again.
  // Wait, if it was hashed with standard rounds (10 or 12), let's check:
  // But wait, the pre-save hook only runs if the password is modified.
  // Let's generate a hash of Nikhil1234 with rounds 10 and 12, then hash it again with 12, and see if it can match targetHash.
  
  // Actually, we don't know the exact salt, but we can verify if the targetHash matches a hashed bcrypt hash!
  // If a bcrypt hash is compared against a candidate that is itself a bcrypt hash:
  // bcrypt.compare(hash_of_nikhil1234, targetHash) -> true!
  // Let's generate a list of possible hashes of Nikhil1234 and see if targetHash matches any of them!
  // Wait! A bcrypt hash is one-way, but we can test if targetHash is a hash of a hash!
  // How?
  // We can generate a hash of Nikhil1234, and then run bcrypt.compare(hash, targetHash)!
  // Since targetHash is in the DB, if targetHash is indeed a double-hash, then comparing a fresh hash of Nikhil1234 with targetHash will return true!
  // Why? Because any valid hash of Nikhil1234 compared with targetHash will match if targetHash is a hash of that hash!
  // Wait, is that true?
  // No! Bcrypt hashes include the salt. If you hash "Nikhil1234" twice:
  // hash1 = bcrypt.hash("Nikhil1234", salt1) -> '$2a$12$salt1...'
  // hash2 = bcrypt.hash(hash1, salt2) -> '$2a$12$salt2...'
  // If you generate a different hash of "Nikhil1234":
  // hash1_new = bcrypt.hash("Nikhil1234", salt3) -> '$2a$12$salt3...'
  // Will bcrypt.compare(hash1_new, hash2) return true?
  // No! Because hash1_new has a different string content than hash1 (since salt3 != salt1)!
  // Since hash1_new !== hash1 as strings, bcrypt.hash(hash1_new, salt2) !== hash2!
  // So bcrypt.compare(hash1_new, hash2) will return false!
  // Ah! This is correct. Because bcrypt treats the input as a raw string. If the raw string changes (due to different salt), the double hash won't match.
  // So we cannot easily test double-hashing this way unless we know the exact intermediate hash.
  
  // But wait! Is there any other way?
  // Let's check: what if the student's password was NOT double hashed?
  // What if the student's password in the database before our script run was the temporary password?
  // If it was the temporary password, what was the plaintext temporary password?
  // The backend prints it in the console or sends it via email.
  // If we can find the email logs or console logs!
  // Let's search the backend folder for nikhilchalla2004@gmail.com!
  // Maybe we can find the temporary password in the email logs or database logs?
}

run();
