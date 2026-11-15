'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateListingForm } from '@/components/create-listing-form';

const ListingDialogContext = createContext<(() => void) | null>(null);

export function ListingDialogProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const triggerReference = useRef<HTMLElement | null>(null);
  const routeOpen = pathname === '/create';

  function changeOpen(nextOpen: boolean) {
    if (submitting) return;
    setOpen(nextOpen);
    if (!nextOpen && routeOpen) router.replace('/');
  }

  return (
    <ListingDialogContext.Provider
      value={() => {
        triggerReference.current = document.activeElement as HTMLElement;
        setOpen(true);
      }}
    >
      {children}
      <Dialog open={open || routeOpen} onOpenChange={changeOpen}>
        <DialogContent
          className="create-dialog"
          aria-describedby={undefined}
          showCloseButton={!submitting}
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (triggerReference.current?.isConnected) {
              event.preventDefault();
              triggerReference.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create listing</DialogTitle>
          </DialogHeader>
          <CreateListingForm
            onCancel={() => changeOpen(false)}
            onSubmittingChange={setSubmitting}
            onSuccess={(identifier) => {
              setOpen(false);
              setSubmitting(false);
              router.push(`/listings/${identifier}?created=1`);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </ListingDialogContext.Provider>
  );
}

export function CreateListingTrigger({
  className = '',
  children = 'Create listing',
}: {
  className?: string;
  children?: ReactNode;
}) {
  const openDialog = useContext(ListingDialogContext);
  return (
    <Button className={className} onClick={() => openDialog?.()}>
      {children}
    </Button>
  );
}
