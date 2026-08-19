const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Comptes de démo hardcodés pour le hackathon
const DEMO_ACCOUNTS = [
  {
    email: 'demo.ministere@mines.ci',
    password: 'demo1234',
    role: 'ministere',
    name: 'Agent Ministère'
  },
  {
    email: 'demo.operateur@geodex.ci',
    password: 'demo1234',
    role: 'terrain',
    name: 'Opérateur Terrain'
  }
];

// POST /api/auth/login
exports.login = (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(422).json({ 
        success: false, 
        message: 'Email et mot de passe requis' 
      });
    }

    const account = DEMO_ACCOUNTS.find(
      a => a.email === email && a.password === password
    );

    if (!account) {
      return res.status(401).json({ 
        success: false, 
        message: 'Identifiants invalides' 
      });
    }

    const token = jwt.sign(
      { email: account.email, role: account.role, name: account.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      token,
      role: account.role,
      name: account.name,
      email: account.email
    });
  } catch (err) {
    console.error('Erreur login:', err.message);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// Middleware JWT pour protéger les routes sensibles
exports.authMiddleware = (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token manquant' });
    }

    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }
};
