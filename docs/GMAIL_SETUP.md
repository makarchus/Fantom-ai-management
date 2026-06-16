# Gmail setup for email verification (2FA)

Meeting Intelligence sends a **6-digit verification code** when users register. Configure Gmail SMTP in `server/.env`.

## Step 1: Use a Google account

You need a Gmail or Google Workspace account that will send verification emails (e.g. `your-app@gmail.com`).

## Step 2: Enable 2-Step Verification

Google requires 2-Step Verification before you can create an App Password.

1. Open [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Under **How you sign in to Google**, click **2-Step Verification**
3. Follow the prompts to enable it (phone or authenticator app)

## Step 3: Create an App Password

App Passwords let the server send mail without using your main Google password.

1. Go to [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - If the link is hidden, search Google Account settings for **App passwords**
2. Sign in again if prompted
3. **Select app:** choose **Mail** (or **Other** and name it `Meeting Intelligence`)
4. **Select device:** choose **Other** and enter `Meeting Intelligence Server`
5. Click **Generate**
6. Copy the **16-character password** (shown as four groups, e.g. `abcd efgh ijkl mnop`)

## Step 4: Add variables to `server/.env`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM=your-email@gmail.com
```

- `SMTP_USER` — full Gmail address
- `SMTP_PASS` — the 16-character App Password (**no spaces**)
- `SMTP_FROM` — usually the same as `SMTP_USER`

## Step 5: Restart the server

```bash
npm run dev
```

Register a new account — you should receive a verification email within a minute.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Email is not configured` | Set `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` in `server/.env` |
| `Invalid login` / `535 Authentication failed` | Use an **App Password**, not your normal Gmail password |
| `App passwords` option missing | Enable **2-Step Verification** first |
| Google Workspace | Admin may need to allow App Passwords: Admin console → Security → Less secure app access / App passwords |
| Email not received | Check spam; confirm `SMTP_USER` matches the account that generated the App Password |

## Security notes

- Never commit `server/.env` or App Passwords to git
- Use a dedicated sending account for production
- For high volume, consider [Google Workspace SMTP relay](https://support.google.com/a/answer/2956491) or a transactional provider (SendGrid, Resend, etc.) with the same `SMTP_*` variables
