//  
// BLK MARKETPLACE BACKEND - server.js 
// Production version pour Render.com 
// 

const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin'); 
require('dotenv').config();

//  
// 1. INITIALISER FIREBASE ADMIN 
// 

let serviceAccount; 
try { 
serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'); 
} catch (error) { 
console.error('❌ ERREUR: FIREBASE_SERVICE_ACCOUNT invalide'); 
console.error('Assurez-vous que la variable d'environnement est configurée correctement'); 
process.exit(1); 
}

try { 
admin.initializeApp({ 
credential: admin.credential.cert(serviceAccount) 
}); 
} catch (error) { 
console.error('❌ Erreur d'initialisation Firebase:', error.message); 
}

const db = admin.firestore(); 
const app = express();

//  
// 2. MIDDLEWARE 
// 

app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logger middleware 
app.use((req, res, next) => { 
console.log([${new Date().toISOString()}] ${req.method} ${req.path}); 
next(); 
});

//  
// 3. VÉRIFIER LES VARIABLES D'ENVIRONNEMENT 
// 

const requiredEnvVars = ['FIREBASE_SERVICE_ACCOUNT', 'IMGBB_API_KEY', 'PORT']; 
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) { 
console.warn('⚠️ Variables manquantes:', missingEnvVars.join(', ')); 
}

//  
// 4. ROUTES DE TEST 
// 

// Health Check 
app.get('/api/health', (req, res) => { 
res.json({ 
status: 'OK ✅', 
timestamp: new Date().toISOString(), 
message: 'BLK Backend is running!', 
environment: process.env.NODE_ENV || 'development' 
}); 
});

//  
// 5. ROUTES ARTICLES 
// 

// Créer un article 
app.post('/api/articles', async (req, res) => { 
try { 
const { title, description, price, category, size, condition, image, sellerId, sellerName } = req.body;

if (!title || !price || !sellerId) {
  return res.status(400).json({ error: 'Champs requis: title, price, sellerId' });
}

const articleData = {
  title,
  description: description || '',
  price: parseInt(price),
  category: category || 'Autre',
  size: size || 'N/A',
  condition: condition || 'Bon état',
  image: image || '',
  sellerId,
  sellerName: sellerName || 'Anonyme',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  status: 'available',
  views: 0,
  likes: 0
};

const docRef = await db.collection('articles').add(articleData);
res.json({ success: true, id: docRef.id, message: 'Article créé avec succès' });
} catch (error) { 
console.error('Erreur création article:', error); 
res.status(500).json({ error: error.message }); 
} 
});

// Récupérer tous les articles 
app.get('/api/articles', async (req, res) => { 
try { 
const limit = parseInt(req.query.limit) || 50; 
const snapshot = await db.collection('articles').limit(limit).get();

const articles = [];
snapshot.forEach(doc => {
  articles.push({ id: doc.id, ...doc.data() });
});

res.json({ success: true, count: articles.length, data: articles });
} catch (error) { 
console.error('Erreur récupération articles:', error); 
res.status(500).json({ error: error.message }); 
} 
});

// Récupérer un article par ID 
app.get('/api/articles/:id', async (req, res) => { 
try { 
const doc = await db.collection('articles').doc(req.params.id).get();

if (!doc.exists) {
  return res.status(404).json({ error: 'Article introuvable' });
}

res.json({ success: true, id: doc.id, ...doc.data() });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

// Chercher articles par vendeur 
app.get('/api/articles/seller/:sellerId', async (req, res) => { 
try { 
const snapshot = await db.collection('articles') 
.where('sellerId', '', req.params.sellerId) 
.get();

const articles = [];
snapshot.forEach(doc => {
  articles.push({ id: doc.id, ...doc.data() });
});

res.json({ success: true, count: articles.length, data: articles });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

//  
// 6. ROUTES COMMANDES 
// 

// Créer une commande 
app.post('/api/orders', async (req, res) => { 
try { 
const { buyerId, items, total, sellerId, buyerName, articleIds } = req.body;

if (!buyerId || !items || !total || !sellerId) {
  return res.status(400).json({ error: 'Champs requis manquants' });
}

const orderData = {
  buyerId,
  buyerName: buyerName || 'Anonyme',
  items,
  articleIds: articleIds || [],
  total: parseInt(total),
  sellerId,
  status: 'pending',
  paymentMethod: null,
  paymentConfirmed: false,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  deliveryDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
};

const docRef = await db.collection('orders').add(orderData);
res.json({ success: true, orderId: docRef.id, message: 'Commande créée' });
} catch (error) { 
console.error('Erreur création commande:', error); 
res.status(500).json({ error: error.message }); 
} 
});

// Récupérer une commande 
app.get('/api/orders/:id', async (req, res) => { 
try { 
const doc = await db.collection('orders').doc(req.params.id).get();

if (!doc.exists) {
  return res.status(404).json({ error: 'Commande introuvable' });
}

res.json({ success: true, id: doc.id, ...doc.data() });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

// Mettre à jour le statut d'une commande 
app.patch('/api/orders/:id/status', async (req, res) => { 
try { 
const { status } = req.body;

if (!status) {
  return res.status(400).json({ error: 'Status requis' });
}

await db.collection('orders').doc(req.params.id).update({
  status,
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});

res.json({ success: true, message: 'Statut mis à jour' });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

// Récupérer les commandes d'un acheteur 
app.get('/api/orders/buyer/:buyerId', async (req, res) => { 
try { 
const snapshot = await db.collection('orders') 
.where('buyerId', '', req.params.buyerId) 
.orderBy('createdAt', 'desc') 
.get();

const orders = [];
snapshot.forEach(doc => {
  orders.push({ id: doc.id, ...doc.data() });
});

res.json({ success: true, count: orders.length, data: orders });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

//  
// 7. UPLOAD IMAGE (ImgBB) 
// 

app.post('/api/upload', async (req, res) => { 
try { 
const { image } = req.body;

if (!image) {
  return res.status(400).json({ error: 'Image requise' });
}

if (!process.env.IMGBB_API_KEY) {
  return res.status(500).json({ error: 'IMGBB_API_KEY non configurée' });
}

// Extraire le base64 si c'est une data URL
const base64Image = image.includes('base64,') 
  ? image.split('base64,')[1] 
  : image;

const response = await fetch('https://api.imgbb.com/1/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    key: process.env.IMGBB_API_KEY,
    image: base64Image
  })
});

const data = await response.json();

if (!data.success) {
  throw new Error('Erreur upload ImgBB: ' + (data.error?.message || 'Unknown error'));
}

res.json({ success: true, url: data.data.url });
} catch (error) { 
console.error('Erreur upload image:', error); 
res.status(500).json({ error: error.message }); 
} 
});

//  
// 8. PORTEFEUILLE (BLK Wallet) 
// 

// Créer ou récupérer le portefeuille 
app.get('/api/wallet/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const walletDoc = await db.collection('wallets').doc(userId).get();

if (!walletDoc.exists) {
  // Créer un nouveau portefeuille
  await db.collection('wallets').doc(userId).set({
    balance: 0,
    currency: 'FCFA',
    transactions: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return res.json({ success: true, balance: 0, transactions: [] });
}

res.json({ success: true, ...walletDoc.data() });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

// Ajouter de l'argent (dépôt) 
app.post('/api/wallet/:userId/deposit', async (req, res) => { 
try { 
const { userId } = req.params; 
const { amount, method, reference, paymentId } = req.body;

if (!amount || amount <= 0) {
  return res.status(400).json({ error: 'Montant invalide' });
}

const walletRef = db.collection('wallets').doc(userId);
const transaction = {
  type: 'deposit',
  amount: parseInt(amount),
  method: method || 'manual', // 'mtn', 'airtel', 'orange', 'manual'
  reference: reference || '',
  paymentId: paymentId || '',
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
  status: 'completed'
};

await walletRef.set({
  transactions: admin.firestore.FieldValue.arrayUnion(transaction)
}, { merge: true });

await walletRef.update({
  balance: admin.firestore.FieldValue.increment(amount)
});

res.json({ success: true, message: 'Dépôt enregistré' });
} catch (error) { 
console.error('Erreur dépôt:', error); 
res.status(500).json({ error: error.message }); 
} 
});

// Retrait d'argent 
app.post('/api/wallet/:userId/withdraw', async (req, res) => { 
try { 
const { userId } = req.params; 
const { amount, phoneNumber, network } = req.body;

if (!amount || amount <= 0) {
  return res.status(400).json({ error: 'Montant invalide' });
}

if (!phoneNumber || !network) {
  return res.status(400).json({ error: 'Numéro et réseau requis' });
}

const walletRef = db.collection('wallets').doc(userId);
const walletDoc = await walletRef.get();

if (!walletDoc.exists) {
  return res.status(404).json({ error: 'Portefeuille introuvable' });
}

const currentBalance = walletDoc.data().balance || 0;
if (currentBalance < amount) {
  return res.status(400).json({ error: 'Solde insuffisant' });
}

const transaction = {
  type: 'withdrawal',
  amount: parseInt(amount),
  phoneNumber,
  network, // 'mtn', 'airtel', 'orange'
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
  status: 'pending'
};

await walletRef.set({
  transactions: admin.firestore.FieldValue.arrayUnion(transaction)
}, { merge: true });

await walletRef.update({
  balance: admin.firestore.FieldValue.increment(-amount)
});

res.json({ 
  success: true, 
  message: 'Retrait initié',
  transactionId: Date.now().toString()
});
} catch (error) { 
console.error('Erreur retrait:', error); 
res.status(500).json({ error: error.message }); 
} 
});

//  
// 9. WEBHOOKS PAIEMENTS 
// 

// Webhook MTN MoMo 
app.post('/webhook/mtn', async (req, res) => { 
try { 
const { transactionId, status, reference, buyerId, amount } = req.body;

console.log('📱 Webhook MTN reçu:', { transactionId, status });

if (status === 'success') {
  // Mettre à jour la commande
  const ordersSnapshot = await db.collection('orders')
    .where('mtnTransactionId', '==', transactionId)
    .limit(1)
    .get();

  if (!ordersSnapshot.empty) {
    const orderDoc = ordersSnapshot.docs[0];
    await orderDoc.ref.update({
      status: 'paid',
      paymentMethod: 'mtn',
      paymentConfirmed: true,
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Ajouter au portefeuille du vendeur (commission)
    if (buyerId && amount) {
      const commission = Math.round(amount * 0.03); // 3% commission
      await db.collection('wallets').doc(buyerId).set({
        transactions: admin.firestore.FieldValue.arrayUnion({
          type: 'payment_commission',
          amount: commission,
          orderId: orderDoc.id,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        })
      }, { merge: true });

      await db.collection('wallets').doc(buyerId).update({
        balance: admin.firestore.FieldValue.increment(commission)
      });
    }
  }
}

res.json({ success: true, message: 'Webhook traité' });
} catch (error) { 
console.error('Erreur webhook MTN:', error); 
res.status(500).json({ error: error.message }); 
} 
});

// Webhook Airtel 
app.post('/webhook/airtel', async (req, res) => { 
try { 
const { transactionId, status, reference, buyerId, amount } = req.body;

console.log('📞 Webhook Airtel reçu:', { transactionId, status });

if (status === 'success') {
  const ordersSnapshot = await db.collection('orders')
    .where('airtelTransactionId', '==', transactionId)
    .limit(1)
    .get();

  if (!ordersSnapshot.empty) {
    const orderDoc = ordersSnapshot.docs[0];
    await orderDoc.ref.update({
      status: 'paid',
      paymentMethod: 'airtel',
      paymentConfirmed: true,
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

res.json({ success: true, message: 'Webhook traité' });
} catch (error) { 
console.error('Erreur webhook Airtel:', error); 
res.status(500).json({ error: error.message }); 
} 
});

// Webhook Orange Money 
app.post('/webhook/orange', async (req, res) => { 
try { 
const { transactionId, status } = req.body;

console.log('🟠 Webhook Orange reçu:', { transactionId, status });

if (status === 'success') {
  const ordersSnapshot = await db.collection('orders')
    .where('orangeTransactionId', '==', transactionId)
    .limit(1)
    .get();

  if (!ordersSnapshot.empty) {
    const orderDoc = ordersSnapshot.docs[0];
    await orderDoc.ref.update({
      status: 'paid',
      paymentMethod: 'orange',
      paymentConfirmed: true,
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

res.json({ success: true, message: 'Webhook traité' });
} catch (error) { 
console.error('Erreur webhook Orange:', error); 
res.status(500).json({ error: error.message }); 
} 
});

//  
// 10. ROUTES MESSAGES 
// 

// Envoyer un message 
app.post('/api/messages', async (req, res) => { 
try { 
const { conversationId, senderId, senderName, message, recipientId } = req.body;

if (!conversationId || !senderId || !message) {
  return res.status(400).json({ error: 'Champs requis manquants' });
}

const messageData = {
  conversationId,
  senderId,
  senderName: senderName || 'Anonyme',
  message,
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
  read: false
};

const docRef = await db.collection('messages').add(messageData);

// Mettre à jour la conversation
await db.collection('conversations').doc(conversationId).update({
  lastMessage: message,
  lastMessageSenderId: senderId,
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});

res.json({ success: true, messageId: docRef.id });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

// Récupérer les messages d'une conversation 
app.get('/api/messages/:conversationId', async (req, res) => { 
try { 
const snapshot = await db.collection('messages') 
.where('conversationId', '', req.params.conversationId) 
.orderBy('timestamp', 'asc') 
.limit(100) 
.get();

const messages = [];
snapshot.forEach(doc => {
  messages.push({ id: doc.id, ...doc.data() });
});

res.json({ success: true, count: messages.length, data: messages });
} catch (error) { 
res.status(500).json({ error: error.message }); 
} 
});

//  
// 11. GESTION D'ERREUR GLOBALE 
// 

app.use((req, res) => { 
res.status(404).json({ error: 'Route non trouvée' }); 
});

app.use((error, req, res, next) => { 
console.error('❌ Erreur:', error); 
res.status(500).json({ error: 'Erreur serveur interne' }); 
});

//  
// 12. DÉMARRER LE SERVEUR 
// ==

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => { 
console.log(\n✅ BLK Backend démarré!); 
console.log(🔥 Port: ${PORT}); 
console.log(📡 Environment: ${process.env.NODE_ENV || 'development'}); 
console.log(🔗 URL: http://localhost:${PORT}/api/health\n); 
});

module.exports = app;
