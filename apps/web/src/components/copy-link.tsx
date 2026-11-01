import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/** An invitation link, shown once: Isolator keeps only its hash. */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Card aria-label="Invitation link" className="flex flex-col gap-2 border-transparent bg-selected">
      <h2>Invitation link</h2>
      <p>
        Send this to them yourself. It works once, for 7 days, and you won’t see it again here.
      </p>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Invitation link"
          value={link}
          readOnly
          className="font-mono"
          onFocus={(event) => event.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </Card>
  );
}
