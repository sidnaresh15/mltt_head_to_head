import { useEffect, useId, useMemo, useState } from 'react';
import { directMeetings, rankPlayers, recordLine, summaryByType, type Perspective } from './matchup';
import type { MatchFilter, MatchType, MlttDataset, Player } from './types';

const FILTERS: Array<{ value: MatchFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'golden', label: 'Golden Game' },
];

const TYPE_LABEL: Record<MatchType, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  golden: 'Golden Game',
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatRefresh(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date));
}

type ComboboxProps = {
  label: string;
  accent: 'red' | 'blue';
  players: Player[];
  selected: Player | null;
  excludedId?: string;
  disabled: boolean;
  onSelect: (player: Player | null) => void;
};

function PlayerCombobox({ label, accent, players, selected, excludedId, disabled, onSelect }: ComboboxProps) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;
  const [query, setQuery] = useState(selected?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => rankPlayers(players, query, excludedId), [excludedId, players, query]);

  useEffect(() => setQuery(selected?.name ?? ''), [selected]);
  useEffect(() => setActiveIndex(0), [query]);

  function choose(player: Player) {
    setQuery(player.name);
    onSelect(player);
    setIsOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && isOpen && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div className={`search-field search-field--${accent}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className="combo-wrap">
        <div className="search-shell">
          <span aria-hidden="true" className="search-icon">⌕</span>
          <input
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-activedescendant={isOpen && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            disabled={disabled}
            placeholder={disabled ? 'Loading player archive…' : 'Search MLTT players…'}
            value={query}
            onFocus={() => setIsOpen(true)}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) onSelect(null);
              setIsOpen(true);
            }}
          />
          {selected && (
            <button
              type="button"
              className="field-clear"
              aria-label={`Clear ${label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { setQuery(''); onSelect(null); setIsOpen(true); }}
            >×</button>
          )}
        </div>
        {isOpen && !disabled && (
          <ul id={listId} className="combo-list" role="listbox" aria-label={`${label} suggestions`}>
            {options.length ? options.map((player, index) => (
              <li
                id={`${listId}-${index}`}
                key={player.id}
                role="option"
                aria-selected={selected?.id === player.id}
                className={index === activeIndex ? 'is-active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(player)}
              >
                <span className="mini-avatar" aria-hidden="true">{initials(player.name)}</span>
                <span><strong>{player.name}</strong><small>{player.country ?? 'MLTT player'}</small></span>
              </li>
            )) : (
              <li className="no-options" role="option" aria-disabled="true">No matching players</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecordStrip({ label, record }: { label: string; record: ReturnType<typeof recordLine> }) {
  return (
    <div className="record-strip">
      <span>{label}</span>
      <strong>{record.player1Wins}<i>–</i>{record.player2Wins}</strong>
      <small>{record.meetings} {record.meetings === 1 ? 'meeting' : 'meetings'}{record.ties ? ` · ${record.ties} even` : ''}</small>
    </div>
  );
}

function MatchCard({ meeting, player1, player2, playerMap }: { meeting: Perspective; player1: Player; player2: Player; playerMap: Map<string, Player> }) {
  const { match, player1Side, player1Score, player2Score, winner } = meeting;
  const side1 = player1Side === 'A' ? match.sideA : match.sideB;
  const side2 = player1Side === 'A' ? match.sideB : match.sideA;
  const team1 = player1Side === 'A' ? match.teamA : match.teamB;
  const team2 = player1Side === 'A' ? match.teamB : match.teamA;
  const partner1 = match.type === 'doubles' ? side1.playerIds.find((id) => id !== player1.id) : undefined;
  const partner2 = match.type === 'doubles' ? side2.playerIds.find((id) => id !== player2.id) : undefined;
  const gameScores = side1.games?.map((score, index) => `${score}–${side2.games?.[index] ?? 0}`).join(' · ');
  const winnerLabel = winner === 'tie' ? 'Direct segment even' : `${winner === 'player1' ? player1.name : player2.name}${match.type === 'doubles' ? ' side' : ''} won`;

  return (
    <article className={`history-card history-card--${match.type}`}>
      <div className="history-topline">
        <span className="type-badge">{TYPE_LABEL[match.type]}</span>
        <span>{match.season}</span>
        <time dateTime={match.date}>{formatDate(match.date)}</time>
      </div>

      <div className="event-line">
        <div><span>Event</span><strong>{match.event}</strong></div>
        <div><span>Location</span><strong>{match.location || 'Location not listed'}</strong></div>
      </div>

      <div className="scoreboard">
        <div className="competitor competitor--one">
          <span className="player-avatar">{initials(player1.name)}</span>
          <div><strong>{player1.name}</strong><small>{team1.name}</small></div>
        </div>
        <div className="direct-score" aria-label={`${player1.name} ${player1Score}, ${player2.name} ${player2Score}`}>
          <b>{player1Score}</b><i>–</i><b>{player2Score}</b>
          <span>{match.type === 'golden' ? 'direct rotation' : 'match record'}</span>
        </div>
        <div className="competitor competitor--two">
          <div><strong>{player2.name}</strong><small>{team2.name}</small></div>
          <span className="player-avatar">{initials(player2.name)}</span>
        </div>
      </div>

      {match.type === 'doubles' && (
        <div className="partners">
          <span>Partners</span>
          <strong>{partner1 ? playerMap.get(partner1)?.name : 'Not listed'}</strong>
          <i>with</i>
          <strong>{partner2 ? playerMap.get(partner2)?.name : 'Not listed'}</strong>
        </div>
      )}

      <div className="score-detail">
        <div><span>Winner</span><strong>{winnerLabel}</strong></div>
        {gameScores && <div><span>Complete game score</span><strong>{gameScores}</strong></div>}
        {match.type === 'golden' && <div><span>Golden Game total</span><strong>{side1.score}–{side2.score}</strong></div>}
        <div><span>Complete team score</span><strong>{team1.score}–{team2.score}</strong></div>
        <a href={match.sourceUrl} target="_blank" rel="noreferrer">Official result viewer <span aria-hidden="true">↗</span></a>
      </div>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState<MlttDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [player1Id, setPlayer1Id] = useState<string | null>(null);
  const [player2Id, setPlayer2Id] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>('all');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/mltt.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Archive request failed (${response.status})`);
        return response.json() as Promise<MlttDataset>;
      })
      .then((dataset) => {
        if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.players) || !Array.isArray(dataset.matches)) {
          throw new Error('The archive format is not supported');
        }
        setData(dataset);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The archive could not be loaded');
      });
    return () => controller.abort();
  }, []);

  const playerMap = useMemo(() => new Map(data?.players.map((player) => [player.id, player]) ?? []), [data]);
  const player1 = player1Id ? playerMap.get(player1Id) ?? null : null;
  const player2 = player2Id ? playerMap.get(player2Id) ?? null : null;
  const allMeetings = useMemo(
    () => data && player1Id && player2Id ? directMeetings(data.matches, player1Id, player2Id) : [],
    [data, player1Id, player2Id],
  );
  const visibleMeetings = useMemo(
    () => filter === 'all' ? allMeetings : allMeetings.filter((meeting) => meeting.match.type === filter),
    [allMeetings, filter],
  );
  const overall = recordLine(allMeetings);
  const typeSummary = summaryByType(allMeetings);
  const player1Percent = overall.meetings ? Math.round((overall.player1Wins / overall.meetings) * 100) : 0;
  const player2Percent = overall.meetings ? Math.round((overall.player2Wins / overall.meetings) * 100) : 0;
  const selected = Boolean(player1 && player2);

  function clearMatchup() {
    setPlayer1Id(null);
    setPlayer2Id(null);
    setFilter('all');
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="MLTT Matchup home">
          <span className="mark">M</span>
          <span>MLTT <b>MATCHUP</b></span>
        </a>
        <span className="archive-pill"><i /> {data ? `${data.stats.teamMatches} verified scorecards` : 'Historical archive'}</span>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow"><span /> Head-to-head explorer</div>
          <h1 id="hero-title">EVERY POINT.<br /><em>EVERY RIVALRY.</em></h1>
          <p>Search the archive. Settle the matchup.</p>
        </section>

        <section className="matchup-card" aria-labelledby="selector-title">
          <div className="card-heading">
            <div>
              <span className="kicker">Build your matchup</span>
              <h2 id="selector-title">Choose two players</h2>
            </div>
            <span className="step"><b>{selected ? '02' : '01'}</b> / 02</span>
          </div>

          {error && <div className="data-error" role="alert"><strong>Archive unavailable.</strong> {error}. Please reload to try again.</div>}

          <div className="selector-grid">
            <PlayerCombobox
              label="Player one"
              accent="red"
              players={data?.players ?? []}
              selected={player1}
              excludedId={player2Id ?? undefined}
              disabled={!data || Boolean(error)}
              onSelect={(player) => setPlayer1Id(player?.id ?? null)}
            />
            <button
              className="versus"
              type="button"
              aria-label="Swap selected players"
              disabled={!player1 && !player2}
              onClick={() => { setPlayer1Id(player2Id); setPlayer2Id(player1Id); }}
            >⇄<span>VS</span></button>
            <PlayerCombobox
              label="Player two"
              accent="blue"
              players={data?.players ?? []}
              selected={player2}
              excludedId={player1Id ?? undefined}
              disabled={!data || Boolean(error)}
              onSelect={(player) => setPlayer2Id(player?.id ?? null)}
            />
          </div>

          {!selected && !error && (
            <div className="empty-preview" aria-live="polite">
              <span className="ball" aria-hidden="true" />
              <div>
                <strong>{data ? 'The table is set.' : 'Loading the archive…'}</strong>
                <p>{data ? `Search ${data.players.length} players across ${data.seasons.filter((season) => season.eventCount).map((season) => season.name).join(' and ')}.` : 'Preparing verified MLTT match history.'}</p>
              </div>
            </div>
          )}
        </section>

        {selected && player1 && player2 && (
          <section className="results" aria-labelledby="results-title">
            <div className="results-heading">
              <div>
                <span className="kicker">Head-to-head record</span>
                <h2 id="results-title">{player1.name} <i>vs</i> {player2.name}</h2>
              </div>
              <button type="button" className="clear-matchup" onClick={clearMatchup}>Clear matchup</button>
            </div>

            <div className="summary-card">
              <div className="summary-player summary-player--one">
                <span className="large-avatar">{initials(player1.name)}</span>
                <div><small>{player1.country ?? 'MLTT player'}</small><strong>{player1.name}</strong><b>{overall.player1Wins} wins</b></div>
              </div>
              <div className="overall-score">
                <span>{overall.meetings} direct {overall.meetings === 1 ? 'meeting' : 'meetings'}</span>
                <div><b>{overall.player1Wins}</b><i>–</i><b>{overall.player2Wins}</b></div>
                <small>{player1Percent}% win rate <i>•</i> {player2Percent}% win rate{overall.ties ? ` • ${overall.ties} even` : ''}</small>
              </div>
              <div className="summary-player summary-player--two">
                <div><small>{player2.country ?? 'MLTT player'}</small><strong>{player2.name}</strong><b>{overall.player2Wins} wins</b></div>
                <span className="large-avatar">{initials(player2.name)}</span>
              </div>
            </div>

            <div className="record-grid">
              <RecordStrip label="Singles" record={typeSummary.singles} />
              <RecordStrip label="Doubles" record={typeSummary.doubles} />
              <RecordStrip label="Golden Game" record={typeSummary.golden} />
            </div>

            <div className="history-heading">
              <div><span className="kicker">Match history</span><h3>Every direct meeting</h3></div>
              <div className="filter-tabs" role="group" aria-label="Filter match history">
                {FILTERS.map((item) => {
                  const count = item.value === 'all' ? allMeetings.length : allMeetings.filter((meeting) => meeting.match.type === item.value).length;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={filter === item.value}
                      className={filter === item.value ? 'is-selected' : ''}
                      onClick={() => setFilter(item.value)}
                    >{item.label}<span>{count}</span></button>
                  );
                })}
              </div>
            </div>

            <div className="history-list" aria-live="polite">
              {visibleMeetings.length ? visibleMeetings.map((meeting) => (
                <MatchCard key={meeting.match.id} meeting={meeting} player1={player1} player2={player2} playerMap={playerMap} />
              )) : (
                <div className="no-meetings">
                  <span className="empty-paddles" aria-hidden="true">◒ ◓</span>
                  <strong>{allMeetings.length ? `No ${filter === 'golden' ? 'Golden Game' : filter} meetings` : 'No direct meetings found'}</strong>
                  <p>{allMeetings.length ? 'Try another match type.' : 'These players may have shared a team or appeared in opposing lineups without directly facing one another.'}</p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer>
        <div>
          <p>Independent historical viewer. Not affiliated with or endorsed by Major League Table Tennis.</p>
          {data && <small>Official dataset last refreshed {formatRefresh(data.refreshedAt)} · {data.matches.length.toLocaleString()} normalized records</small>}
        </div>
        <a href="https://www.mltt.com/" target="_blank" rel="noreferrer">Official MLTT site ↗</a>
      </footer>
    </div>
  );
}
