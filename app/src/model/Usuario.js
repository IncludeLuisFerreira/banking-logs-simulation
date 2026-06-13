class Usuario {
  constructor(id, username, passwordHash, criadoEm) {
    this.id = id;
    this.username = username;
    this.passwordHash = passwordHash;
    this.criadoEm = criadoEm || new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      criadoEm: this.criadoEm
    };
  }
}

module.exports = Usuario;
