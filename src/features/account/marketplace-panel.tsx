'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { StatusPanel } from '@/components/route-states';
import { getLocalEconomy, purchaseLocalConsumable } from '@/adapters/local-account';
import { getEconomy, purchaseConsumable } from '@/adapters/supabase/account';
import { operationId } from '@/adapters/supabase/shared';
import { useAuth } from '@/components/providers';

type Product = 'reveal_one_letter' | 'remove_incorrect_letters';

const products = [
  {
    id: 'reveal_one_letter' as const,
    name: 'Reveal One Letter',
    price: 25,
    description: 'Reveal one unknown position in Solo Practice.',
  },
  {
    id: 'remove_incorrect_letters' as const,
    name: 'Remove Incorrect Letters',
    price: 40,
    description: 'Rule out keyboard letters that cannot appear in the answer.',
  },
] as const;

export function MarketplacePanel() {
  const auth = useAuth();
  const authenticated = auth.status === 'signed-in';
  const ownerNamespace = authenticated ? `account:${auth.user?.id ?? ''}` : 'guest';
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<Product | null>(null);
  const economy = useQuery({
    queryKey: ['economy', ownerNamespace],
    queryFn: () => (authenticated ? getEconomy() : getLocalEconomy(ownerNamespace)),
    enabled: auth.status !== 'loading',
  });
  const pending = useRef<Partial<Record<Product, string>>>({});
  const purchase = useMutation({
    mutationFn: async (product: Product) => {
      const id = pending.current[product] ?? operationId(`market:${product}`);
      pending.current[product] = id;
      return {
        product,
        result: authenticated
          ? await purchaseConsumable(product, id)
          : await purchaseLocalConsumable(ownerNamespace, product, id),
      };
    },
    onSuccess: ({ product, result }) => {
      delete pending.current[product];
      setConfirming(null);
      client.setQueryData(['economy', ownerNamespace], result);
      void client.invalidateQueries({ queryKey: ['account-summary'] });
    },
  });

  if (economy.isPending) return <p aria-live="polite">Loading your balance…</p>;
  if (!economy.data) {
    return (
      <StatusPanel
        title="Balance unavailable"
        action={<button onClick={() => void economy.refetch()}>TRY AGAIN</button>}
      >
        <p>Your balance could not be loaded. No purchase was attempted.</p>
      </StatusPanel>
    );
  }

  return (
    <>
      <div className="balance-line" aria-live="polite">
        <span>{authenticated ? 'Account balance' : 'Guest balance on this device'}</span>
        <strong className="mono">{economy.data.coins} coins</strong>
      </div>
      <div className="data-list">
        {products.map((product) => {
          const owned =
            product.id === 'reveal_one_letter'
              ? economy.data.reveal_one_letter
              : economy.data.remove_incorrect_letters;
          return (
            <div className="data-row product-row" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <p>{product.description}</p>
                <span className="mono">Owned: {owned}</span>
              </div>
              <button
                type="button"
                disabled={purchase.isPending || economy.data.coins < product.price}
                onClick={() => setConfirming(product.id)}
              >
                BUY · {product.price}
              </button>
            </div>
          );
        })}
      </div>
      {confirming && (
        <section
          className="confirmation-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="purchase-confirmation-title"
        >
          <div>
            <h2 id="purchase-confirmation-title">Confirm purchase</h2>
            <p>
              {products.find((product) => product.id === confirming)?.name} costs{' '}
              {products.find((product) => product.id === confirming)?.price} coins.
            </p>
            <p>Tools are available in Solo Practice.</p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="primary"
              disabled={purchase.isPending}
              onClick={() => purchase.mutate(confirming)}
            >
              {purchase.isPending ? 'PURCHASING…' : 'CONFIRM PURCHASE'}
            </button>
            <button type="button" disabled={purchase.isPending} onClick={() => setConfirming(null)}>
              CANCEL
            </button>
          </div>
        </section>
      )}
      <p aria-live="polite">
        {purchase.isSuccess
          ? 'Purchase complete.'
          : purchase.isError
            ? 'Purchase was not completed. Retry uses the same operation.'
            : ''}
      </p>
    </>
  );
}
