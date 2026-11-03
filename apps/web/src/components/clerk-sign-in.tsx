import { ClerkFailed, SignIn } from '@clerk/react';

// The entry page is already the card, and already has the heading.
const embedded = {
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', border: 'none', boxShadow: 'none' },
    card: { padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' },
    header: { display: 'none' },
    footer: { background: 'transparent' },
  },
};

interface ClerkSignInProps {
  /** Where to land afterwards. */
  redirectTo: string;
  /** Fills in the address, for someone arriving by invitation. */
  email?: string;
}

/**
 * Clerk's sign-in on an entry page. It also signs people up, because having an account gets
 * nobody into an Organization: that takes an invitation.
 */
export function ClerkSignIn({ redirectTo, email }: ClerkSignInProps) {
  return (
    <>
      <SignIn
        routing="hash"
        withSignUp
        forceRedirectUrl={redirectTo}
        signUpForceRedirectUrl={redirectTo}
        initialValues={email ? { emailAddress: email } : undefined}
        appearance={embedded}
      />
      <ClerkFailed>
        <p className="text-muted-foreground">
          Sign-in couldn’t load. Check your connection, then reload this page.
        </p>
      </ClerkFailed>
    </>
  );
}
