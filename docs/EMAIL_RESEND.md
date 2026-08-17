# Resend email + Firebase Cloud Functions
#
# 1) Vercel (live API emails for register / approve / license / Email Center)
#    Project Settings → Environment Variables:
#      RESEND_API_KEY=re_...
#      EMAIL_REPLY_TO=lumoedge08@gmail.com
#      EMAIL_FROM=Lumo Edge <onboarding@resend.dev>   # until domain verified
#    Then Redeploy.
#
# 2) Verify domain in Resend: https://resend.com/domains → lumoedge.com
#    After verified, set EMAIL_FROM=Lumo Edge <noreply@lumoedge.com>
#    (gmail.com cannot be used as From on Resend)
#
# 3) Optional Cloud Functions (RTDB triggers + HTTPS sendAdminEmail):
#    cd functions && npm install
#    firebase login
#    firebase functions:secrets:set RESEND_API_KEY
#    firebase deploy --only functions
#
# Automatic emails also fire from the Vercel API with the same idempotency keys,
# so duplicates are skipped if both paths run.
