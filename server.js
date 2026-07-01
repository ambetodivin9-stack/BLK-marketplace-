const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
} catch (e) {
  console.error('ERROR: Invalid FIREBASE_SERVICE_ACCOUNT');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error('Firebase init error:', e.message);
}

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'BLK Backend is running!'
  });
});

// ============ ARTICLES ============

// Create article
app.post('/api/articles', async (req, res) => {
  try {
    const { title, description, price, category, size, condition, image, sellerId, sellerName } = req.body;

    if (!title || !price || !sellerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const articleData = {
      title,
      description: description || '',
      price: parseInt(price),
      category: category || 'Other',
      size: size || 'N/A',
      condition: condition || 'Good',
      image: image || '',
      sellerId,
      sellerName: sellerName || 'Anonymous',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'available',
      views: 0
    };

    const docRef = await db.collection('articles').add(articleData);
    res.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Error creating article:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all articles
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
    console.error('Error getting articles:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single article
app.get('/api/articles/:id', async (req, res) => {
  try {
    const doc = await db.collection('articles').doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ success: true, id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get articles by seller
app.get('/api/seller/:sellerId/articles', async (req, res) => {
  try {
    const snapshot = await db.collection('articles')
      .where('sellerId', '==', req.params.sellerId)
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

// ============ ORDERS ============

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { buyerId, items, total, sellerId, buyerName } = req.body;

    if (!buyerId || !items || !total || !sellerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orderData = {
      buyerId,
      buyerName: buyerName || 'Anonymous',
      items,
      total: parseInt(total),
      sellerId,
      status: 'pending',
      paymentMethod: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      deliveryDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };

    const docRef = await db.collection('orders').add(orderData);
    res.json({ success: true, orderId: docRef.id });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get order
app.get('/api/orders/:id', async (req, res) => {
  try {
    const doc = await db.collection('orders').doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
    }

    await db.collection('orders').doc(req.params.id).update({ status });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get buyer orders
app.get('/api/buyer/:buyerId/orders', async (req, res) => {
  try {
    const snapshot = await db.collection('orders')
      .where('buyerId', '==', req.params.buyerId)
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

// ============ IMAGE UPLOAD ============

// Upload to ImgBB
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image required' });
    }

    if (!process.env.IMGBB_API_KEY) {
      return res.status(500).json({ error: 'IMGBB_API_KEY not configured' });
    }

    // Extract base64 if data URL
    const base64Image = image.includes('base64,')
      ? image.split('base64,')[1]
      : image;

    const formData = new URLSearchParams();
    formData.append('key', process.env.IMGBB_API_KEY);
    formData.append('image', base64Image);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!data.success) {
      return res.status(400).json({ error: 'ImgBB upload failed' });
    }

    res.json({ success: true, url: data.data.url });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ WALLET ============

// Get wallet
app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const walletDoc = await db.collection('wallets').doc(userId).get();

    if (!walletDoc.exists) {
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

// Deposit to wallet
app.post('/api/wallet/:userId/deposit', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, method, reference } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const walletRef = db.collection('wallets').doc(userId);
    const transaction = {
      type: 'deposit',
      amount: parseInt(amount),
      method: method || 'manual',
      reference: reference || '',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'completed'
    };

    await walletRef.set({
      transactions: admin.firestore.FieldValue.arrayUnion(transaction)
    }, { merge: true });

    await walletRef.update({
      balance: admin.firestore.FieldValue.increment(amount)
    });

    res.json({ success: true, message: 'Deposit recorded' });
  } catch (error) {
    console.error('Error depositing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Withdraw from wallet
app.post('/api/wallet/:userId/withdraw', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, phoneNumber, network } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!phoneNumber || !network) {
      return res.status(400).json({ error: 'Phone and network required' });
    }

    const walletRef = db.collection('wallets').doc(userId);
    const walletDoc = await walletRef.get();

    if (!walletDoc.exists) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const currentBalance = walletDoc.data().balance || 0;
    if (currentBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const transaction = {
      type: 'withdrawal',
      amount: parseInt(amount),
      phoneNumber,
      network,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    };

    await walletRef.set({
      transactions: admin.firestore.FieldValue.arrayUnion(transaction)
    }, { merge: true });

    await walletRef.update({
      balance: admin.firestore.FieldValue.increment(-amount)
    });

    res.json({ success: true, message: 'Withdrawal initiated' });
  } catch (error) {
    console.error('Error withdrawing:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ MESSAGES ============

// Send message
app.post('/api/messages', async (req, res) => {
  try {
    const { conversationId, senderId, senderName, message, recipientId } = req.body;

    if (!conversationId || !senderId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const messageData = {
      conversationId,
      senderId,
      senderName: senderName || 'Anonymous',
      message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    };

    const docRef = await db.collection('messages').add(messageData);

    // Update conversation
    await db.collection('conversations').doc(conversationId).update({
      lastMessage: message,
      lastMessageSenderId: senderId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {
      // Conversation doesn't exist yet, create it
      db.collection('conversations').doc(conversationId).set({
        lastMessage: message,
        lastMessageSenderId: senderId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    res.json({ success: true, messageId: docRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages
app.get('/api/messages/:conversationId', async (req, res) => {
  try {
    const snapshot = await db.collection('messages')
      .where('conversationId', '==', req.params.conversationId)
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

// ============ WEBHOOKS ============

// MTN MoMo webhook
app.post('/webhook/mtn', async (req, res) => {
  try {
    const { transactionId, status } = req.body;
    console.log('MTN webhook:', transactionId, status);

    if (status === 'success') {
      const ordersSnapshot = await db.collection('orders')
        .where('mtnTransactionId', '==', transactionId)
        .limit(1)
        .get();

      if (!ordersSnapshot.empty) {
        const orderDoc = ordersSnapshot.docs[0];
        await orderDoc.ref.update({
          status: 'paid',
          paymentMethod: 'mtn'
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('MTN webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Airtel webhook
app.post('/webhook/airtel', async (req, res) => {
  try {
    const { transactionId, status } = req.body;
    console.log('Airtel webhook:', transactionId, status);

    if (status === 'success') {
      const ordersSnapshot = await db.collection('orders')
        .where('airtelTransactionId', '==', transactionId)
        .limit(1)
        .get();

      if (!ordersSnapshot.empty) {
        const orderDoc = ordersSnapshot.docs[0];
        await orderDoc.ref.update({
          status: 'paid',
          paymentMethod: 'airtel'
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Airtel webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ ERROR HANDLING ============

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BLK Backend started on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
