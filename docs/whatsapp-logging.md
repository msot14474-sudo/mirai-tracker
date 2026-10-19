# Conversational WhatsApp class logging

Teachers link their number in My account using a short-lived code sent from that number to the business number. They then describe classes naturally. Ollama interprets the date, reads currently assigned classes, and proposes a validated session log. Unambiguous updates save automatically. Missing details trigger a follow-up; questions do not write logs. Conversation context lasts 24 hours after activity (most recent 12 messages, up to about 24,000 characters). Session logs persist normally.

Example: “Yesterday's Web Development class for batch A is fully complete. Covered HTML forms; classwork completed, no homework. Validation is left for the next class.” If percentages, work statuses, or class identity are unclear, the assistant asks instead of inventing them.

Carry-forward topic references and proposed shifts can be recorded in log notes. This integration does not move timetable slots. Teachers should use the timetable workflow for actual rescheduling.

## Activation

Use a Meta WhatsApp Business Platform account and a business phone number. Direct Cloud API avoids a third-party messaging subscription; Meta and the model provider's pricing still applies. This is not an unlimited-free service.

Set on the API deployment:

- WHATSAPP_ENABLED=true (omit or false until configuration is complete)
- WHATSAPP_ACCESS_TOKEN: server-side Meta access token with messaging permission
- WHATSAPP_PHONE_NUMBER_ID: registered business number ID
- WHATSAPP_BUSINESS_NUMBER: business number with country code, displayed for linking
- WHATSAPP_APP_SECRET: Meta app secret for signed webhook validation
- WHATSAPP_VERIFY_TOKEN: a random secret chosen for webhook verification
- WHATSAPP_GRAPH_VERSION: supported Graph API version shown in Meta's developer configuration
- OLLAMA_API_KEY: existing server-side cloud key
- AI_MODEL: compatible Ollama chat model (defaults to gpt-oss:20b)

Configure the webhook at https://mirai-tracker-api.vercel.app/whatsapp/webhook, verify using the same verify token, and subscribe to messages. Redeploy the API after changing environment variables. Never expose tokens in VITE variables.

## Reliability and verification

Raw-body HMAC verification is mandatory. Current active faculty access and assignment are checked for each message; ordinary session-log validation applies. Per-phone Redis locks serialize webhook processing. A unique external request ID prevents duplicate logs on delivery retries. Receipts retain reply text for retries and should follow the institution's retention policy. The provider calls are bounded; failures never become fabricated logs. Webhook processing is synchronous, so configure host duration for two 25-second AI calls plus reply delivery and monitor webhook retries. Replayed replies may repeat after delivery uncertainty, but saved logs remain idempotent.

Before enabling for faculty, test a real linked account, ambiguous class selection, an actual saved log, duplicate delivery, unlinking, revoked faculty access, and unavailable Ollama. Automated tests mock the external providers; live Meta delivery requires the credentials above.
