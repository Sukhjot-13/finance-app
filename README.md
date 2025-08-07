# FinTrack - Personal Finance Tracker

FinTrack is a full-stack web application designed to help users track their income, expenses, and savings. It features a secure, passwordless authentication system using one-time passwords (OTPs) and provides a clean, modern interface for managing financial data.

## Features

- **Secure Authentication:** Passwordless login system using email-based OTPs.
- **Dashboard Overview:** A summary of recent financial activity.
- **Transaction Management:** CRUD (Create, Read, Update, Delete) functionality for all transactions.
- **Financial Reports:** Visual representations of financial data (feature in development).
- **Responsive UI:** A clean and modern user interface built with Tailwind CSS that works on all devices.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (v13+ with App Router)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database:** [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/) ODM
- **Authentication:** JSON Web Tokens (JWT) & One-Time Passwords (OTP)
- **Email Service:** [Nodemailer](https://nodemailer.com/) for sending OTP emails.
- **UI Components:** [Lucide React](https://lucide.dev/) for icons & [Framer Motion](https://www.framer.com/motion/) for animations.

---

## Getting Started

Follow these instructions to get a local copy of the project up and running.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [MongoDB](https://www.mongodb.com/try/download/community) instance (local or cloud-based like MongoDB Atlas)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone <your-repository-url>
    cd finance-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

### Environment Variables

Create a `.env.local` file in the root of the project and add the following environment variables.

```env
# MongoDB Connection String
MONGODB_URI="your_mongodb_connection_string"

# JWT Secret Key for signing tokens
JWT_SECRET="your_strong_jwt_secret_key"

# Nodemailer configuration for sending OTP emails
# You can use a service like Ethereal for testing or configure your own SMTP server.
EMAIL_HOST="smtp.ethereal.email"
EMAIL_PORT=587
EMAIL_USER="your_ethereal_or_smtp_user"
EMAIL_PASS="your_ethereal_or_smtp_password"
```

### Running the Development Server

Once the environment variables are set, you can start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## Project Structure

The project uses the Next.js App Router structure.

```
finance-app/
├── src/
│   ├── app/
│   │   ├── (auth)/             # Group for authentication-related pages
│   │   │   └── login/
│   │   │       └── page.js     # Login UI component
│   │   ├── (main)/             # Group for main application pages
│   │   │   ├── dashboard/
│   │   │   ├── transactions/
│   │   │   └── layout.js       # Main layout with sidebar and header
│   │   ├── api/                # API routes
│   │   │   ├── auth/
│   │   │   │   ├── otp/
│   │   │   │   │   ├── send/route.js
│   │   │   │   │   └── verify/route.js
│   │   │   │   └── logout/route.js
│   │   │   └── user/route.js
│   │   └── layout.js           # Root layout
│   ├── lib/                    # Helper libraries and utilities
│   │   ├── dbConnect.js        # MongoDB connection handler
│   │   └── sendEmail.js        # Nodemailer email sending utility
│   └── models/                 # Mongoose data models
│       ├── transaction.model.js
│       └── user.model.js
├── .env.local                  # Environment variables (not committed)
└── next.config.js
```

---

## How It Works

### Authentication Flow

The application uses a secure, passwordless OTP-based authentication system.

1.  **Enter Email:** The user enters their email address on the login page.
2.  **Send OTP:** The frontend sends a `POST` request to `/api/auth/otp/send`.
    - The server finds or creates a user with that email.
    - It generates a secure, random 6-digit OTP.
    - The OTP is hashed using `bcryptjs` and stored in the database along with an expiration time (10 minutes).
    - An email containing the plain-text OTP is sent to the user's email address using Nodemailer.
3.  **Verify OTP:** The user enters the OTP they received.
    - The frontend sends a `POST` request to `/api/auth/otp/verify` with the email and OTP.
    - The server finds the user and checks if the OTP has expired.
    - It compares the submitted OTP with the hashed OTP in the database using `bcrypt.compare`.
    - If valid, it generates a JWT (`accessToken`) containing the user's ID.
    - The JWT is set as an `httpOnly` cookie, which is secure against XSS attacks.
4.  **Access Granted:** The user is redirected to the main application dashboard. The `accessToken` cookie is automatically sent with all subsequent API requests to authenticate the user.

### API Endpoints

| Endpoint               | Method | Description                                                                    |
| ---------------------- | ------ | ------------------------------------------------------------------------------ |
| `/api/auth/otp/send`   | `POST` | Sends a 6-digit OTP to the user's email. Creates the user if they don't exist. |
| `/api/auth/otp/verify` | `POST` | Verifies the submitted OTP. On success, returns a JWT as an `httpOnly` cookie. |
| `/api/auth/logout`     | `POST` | Clears the `accessToken` cookie, logging the user out.                         |
| `/api/user`            | `GET`  | Retrieves the current authenticated user's information (based on the JWT).     |
| `/api/transactions`    | `GET`  | Fetches all transactions for the authenticated user.                           |
| `/api/transactions`    | `POST` | Creates a new transaction for the authenticated user.                          |
