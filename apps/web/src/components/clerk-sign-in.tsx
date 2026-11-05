import { ClerkFailed, SignIn } from '@clerk/react';

// The entry page is already the card, and already has the heading.
const embedded = {
  elements: {
    rootBox: { width: '100%' },
    // Clerk clips the card box and pulls the card 1px over its edge. Without the card's padding
    // that clips the fields' borders and focus rings, so neither may stay.
    cardBox: { width: '100%', border: 'none', boxShadow: 'none', overflow: 'visible' },
    card: { padding: 0, margin: 0, border: 'none', boxShadow: 'none', background: 'transparent' },
    // The first step's header repeats the page heading. Later ones say where the code went.
    header: { '.cl-signIn-start &': { display: 'none' } },
    logoBox: { display: 'none' },
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
