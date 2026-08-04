import type { PreSignUpTriggerHandler } from "aws-lambda";

// No email-verification step is wired up yet, so auto-confirm new accounts and
// mark the email verified. This makes signUp() -> immediately signed in match
// the local adapter. Swap this out when real verification is added.
export const handler: PreSignUpTriggerHandler = async (event) => {
  event.response.autoConfirmUser = true;
  if (event.request.userAttributes.email) event.response.autoVerifyEmail = true;
  return event;
};
