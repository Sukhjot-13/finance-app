# Environment Setup Guide

## Required Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/fintrack_db?retryWrites=true&w=majority

# Email Service (Brevo/Sendinblue)
BREVO_API_KEY=your_brevo_api_key_here
EMAIL_FROM=noreply@yourdomain.com

# JWT Secrets (Generate these using: openssl rand -base64 32)
ACCESS_TOKEN_SECRET=your_super_secret_access_token_string_here
REFRESH_TOKEN_SECRET=your_super_secret_refresh_token_string_here
JWT_SECRET=your_super_secret_jwt_token_string_here

# Optional: Environment
NODE_ENV=development
```

## How to Generate JWT Secrets

Run these commands in your terminal:

```bash
# Generate ACCESS_TOKEN_SECRET
openssl rand -base64 32

# Generate REFRESH_TOKEN_SECRET  
openssl rand -base64 32

# Generate JWT_SECRET
openssl rand -base64 32
```

## Setting up Brevo (Email Service)

1. Sign up at [Brevo](https://www.brevo.com/) (formerly Sendinblue)
2. Go to Settings > API Keys
3. Create a new API key
4. Add your sender email in Settings > Senders & IP
5. Use the API key as `BREVO_API_KEY`
6. Use your verified sender email as `EMAIL_FROM`

## Setting up MongoDB

1. Create a MongoDB Atlas account or use local MongoDB
2. Create a new database called `fintrack_db`
3. Get your connection string
4. Replace username, password, and cluster details in `MONGODB_URI`
