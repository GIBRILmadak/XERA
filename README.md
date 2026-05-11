# XERA - Tracez votre progression

<div align="center">
  <img src="./icons/logo.png" alt="XERA Logo" width="200" height="200" />
</div>

## Overview

**XERA** is a comprehensive streaming and content creation platform designed to help creators track their progress, monetize their content, and engage with their audience. Built with modern web technologies, XERA provides creators with powerful tools for live streaming, analytics, subscriber management, and revenue generation.

## 🚀 Key Features

### **Streaming & Broadcasting**
- Live streaming capabilities with real-time analytics
- Stream creation and management dashboard
- Multiple streaming quality options
- Broadcasting to multiple platforms

### **Creator Dashboard**
- Comprehensive creator control panel
- Real-time performance metrics
- Content management tools
- Audience insights and analytics

### **Monetization**
- Multiple revenue streams
- Subscription plans and management
- Payment processing (Maisha Pay integration)
- Wallet and payout system
- Channel support and donations

### **Analytics & Insights**
- Detailed streaming analytics
- Follower growth tracking
- Engagement metrics
- Revenue analytics and reporting

### **Community & Engagement**
- Follower system
- Real-time messaging and live chat
- Push notifications
- Support ticket system
- Email reminders and notifications

### **User Management**
- Authentication and authorization
- Profile customization
- Badge and achievement system
- Admin controls for platform management

## 📊 Project Structure

```
XERA/
├── icons/                      # Application logos and SVG assets
├── js/                         # JavaScript application logic
│   ├── app.js                 # Core application logic
│   ├── streaming.js           # Live streaming functionality
│   ├── monetization.js        # Revenue management
│   ├── analytics.js           # Analytics and metrics
│   ├── creator-dashboard.js   # Creator control panel
│   ├── messages.js            # Messaging system
│   ├── notifications.js       # Push and email notifications
│   ├── subscription-plans.js  # Subscription management
│   └── supabase-config.js     # Database configuration
├── css/                        # Application styles
│   ├── style.css              # Main stylesheet
│   ├── monetization.css       # Monetization UI
│   ├── streaming-analytics.css# Analytics styles
│   └── login.css              # Authentication UI
├── api/                        # Backend API endpoints
│   ├── admin/                 # Admin management APIs
│   ├── monetization/          # Monetization endpoints
│   └── reminders/             # Reminder services
├── sql/                        # Database schemas and migrations
├── server/                     # Node.js backend server
│   ├── index.js               # Main server entry
│   ├── monetization-server.js # Monetization service
│   └── bot-runner.js          # Bot automation
├── html/                       # HTML pages
│   ├── index.html             # Landing page
│   ├── stream.html            # Streaming page
│   ├── creator-dashboard.html # Creator panel
│   └── monetization.html      # Monetization settings
└── manifest.json              # PWA configuration
```

## 🛠️ Tech Stack

### Frontend
- **HTML5 & CSS3** - Modern web standards
- **JavaScript (ES6+)** - Core application logic
- **React** - UI components and state management
- **PWA** - Progressive Web App support

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Supabase** - Database and real-time features
- **Firebase Admin** - Authentication and messaging
- **Google Cloud** - Logging and monitoring

### APIs & Services
- **Web Push API** - Push notifications
- **WebSocket** - Real-time communication
- **RESTful APIs** - Data endpoints
- **Maisha Pay** - Payment processing

### Tools & Build
- **Vite** - Build tool and dev server
- **npm** - Package management
- **Vercel** - Deployment platform

## 📋 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Supabase account
- Firebase project
- Maisha Pay API credentials

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd XERA
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your Supabase, Firebase, and Maisha Pay credentials

4. **Initialize the database**
   - Run migrations from `./sql/` directory
   - Execute schema setup scripts in your Supabase project

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Start API server**
   ```bash
   npm run api
   ```

## 🚀 Getting Started

### For Creators
1. Sign up or log in to your XERA account
2. Complete your profile and customization
3. Set up your streaming setup in Creator Dashboard
4. Configure monetization settings
5. Go live and start earning!

### For Administrators
1. Access the admin panel
2. Manage users, content, and platform settings
3. Monitor analytics and system health
4. Manage badge and achievement systems

## 💰 Monetization Features

- **Subscriptions** - Set up recurring subscription plans
- **Donations** - Accept one-time support from viewers
- **Ads Revenue** - Earn from platform ads
- **Wallet System** - Track and manage earnings
- **Payouts** - Withdraw earnings via integrated payment methods

## 📊 Analytics & Reporting

Track your success with comprehensive metrics:
- Real-time viewer count and engagement
- Follower growth trends
- Revenue analytics by source
- Content performance insights
- Audience demographics

## 🔐 Security

- Secure authentication with Firebase
- Row-level security (RLS) on database
- JWT token management
- Protected API endpoints
- Regular security audits

## 🌐 Multi-Language Support

XERA supports both **English** and **French** interfaces with automatic language detection based on user preferences.

## 📱 PWA Support

XERA is a Progressive Web App, enabling:
- Offline functionality
- Install as native app
- Push notifications
- Optimized performance

## 🐛 Troubleshooting

### Common Issues

**Database Connection Issues**
- Verify Supabase credentials in `.env`
- Check RLS policies are correctly configured
- Review database schema migrations

**Streaming Issues**
- Check WebSocket connection
- Verify browser WebRTC support
- Review streaming quality settings

**Payment Processing**
- Verify Maisha Pay API credentials
- Check payment gateway status
- Review transaction logs

For more help, see the documentation in the `./server/` directory.

## 📚 Documentation

- [Monetization Guide](./MONETIZATION_README.md)
- [Bot Setup Guide](./BOTS_SETUP.md)
- [Followers Fix Guide](./FOLLOWERS-FIX-COMPLETE-GUIDE.md)
- [Egress Optimization](./EGRESS_OPTIMIZATION.md)

## 🤝 Contributing

We welcome contributions! Please follow our coding standards:
- Use existing code conventions
- Write clear commit messages
- Test your changes thoroughly
- Update documentation as needed

## 📄 License

ISC License

## 👥 Support

For support:
- Check existing documentation
- Review code comments and inline documentation
- Contact the development team

---

<div align="center">
  <p>Built with 💜 by the XERA team</p>
  <p>Track your progression • Engage your audience • Monetize your content</p>
</div>
