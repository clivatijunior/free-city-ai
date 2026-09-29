import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids';

const sats = new Intl.NumberFormat('pt-BR');

export default function FreeCityEconomy({
  worldId,
  playerId,
}: {
  worldId: Id<'worlds'>;
  playerId: GameId<'players'>;
}) {
  const account = useQuery(api.economy.main.balance, { worldId, playerId });
  const assets = useQuery(api.property.main.getOwnedAssets, {
    worldId,
    ownerPlayerId: playerId,
  });
  const reputation = useQuery(api.arbitration.main.reputation, { worldId, playerId });
  const transactions = useQuery(api.economy.main.recentForPlayer, {
    worldId,
    playerId,
    limit: 3,
  });

  const holdings = assets?.reduce<Record<string, number>>((totals, asset) => {
    totals[asset.type] = (totals[asset.type] ?? 0) + asset.quantity;
    return totals;
  }, {});

  return (
    <section className="box mt-4" aria-label="Free City economy">
      <div className="bg-brown-700 p-3 text-sm leading-tight">
        <h3 className="font-display text-xl tracking-wide text-yellow-200">Free City</h3>
        <div className="mt-2 flex justify-between gap-3">
          <span>Liquidez FC-BTC</span>
          <strong>
            {account === undefined ? '…' : `${sats.format(account?.balanceSats ?? 0)} sats`}
          </strong>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span>Reputação</span>
          <strong>{reputation === undefined ? '…' : (reputation?.score ?? 0)}</strong>
        </div>
        <div className="mt-3 border-t border-brown-500 pt-2">
          <span className="text-brown-200">Bens físicos</span>
          {!holdings && <div>Carregando…</div>}
          {holdings && Object.keys(holdings).length === 0 && <div>Nenhum ativo</div>}
          {holdings &&
            Object.entries(holdings).map(([type, quantity]) => (
              <div className="flex justify-between" key={type}>
                <span className="capitalize">{type}</span>
                <strong>{sats.format(quantity)}</strong>
              </div>
            ))}
        </div>
        <div className="mt-3 border-t border-brown-500 pt-2">
          <span className="text-brown-200">Atividade recente</span>
          {transactions === undefined && <div>Carregando…</div>}
          {transactions?.length === 0 && <div>Nenhuma transação</div>}
          {transactions?.map((transaction) => {
            const received = transaction.direction === 'received';
            return (
              <div className="mt-1 flex justify-between gap-2" key={transaction.txId}>
                <span className="truncate">{transaction.type}</span>
                <strong className={received ? 'text-green-300' : 'text-red-300'}>
                  {received ? '+' : '-'}
                  {sats.format(transaction.amountSats)} sats
                </strong>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-brown-200">
          Patrimônio é exibido por quantidade; não há cotação oficial imposta aos bens.
        </p>
      </div>
    </section>
  );
}

