import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'birthday-treat-votes-v2';
const LEGACY_STORAGE_KEY = 'birthday-treat-votes-v1';
const API_VOTES_URL = '/api/votes';

const menuItems = [
  { id: 'fried-noodle', name: 'Fried Noodle', nameMm: 'ခေါက်ဆွဲကြော်', image: 'https://images.deliveryhero.io/image/fd-mm/Products/3127286.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] },
  { id: 'fried-rice', name: 'Fried Rice', nameMm: 'ထမင်းကြော်', image: 'https://images.deliveryhero.io/image/fd-mm/products/65255.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] },
  { id: 'steamed-rice-assorted', name: 'Steamed Rice with Assorted Vegetables', nameMm: 'ထမင်းပေါင်း', image: 'https://images.deliveryhero.io/image/fd-mm/Products/3127295.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] },
  { id: 'pushu-fried-rice', name: 'Pushu Fried Rice', nameMm: 'ပသျှူး ထမင်းကြော်', image: 'https://images.deliveryhero.io/image/fd-mm/products/65257.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] },
  { id: 'fish-paste-fried-rice', name: 'Fish Paste Fried Rice', nameMm: 'ငါးပိ ထမင်းကြော်', image: 'https://images.deliveryhero.io/image/fd-mm/products/65258.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] },
  { id: 'stir-fried-rice-noodle', name: 'Stir Fried Rice Noodle', nameMm: 'ကတ်ကြေးကိုက်', image: 'https://images.deliveryhero.io/image/fd-mm/Products/3127298.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] },
  { id: 'grilled-pork-belly-steamed-rice', name: 'Grilled Pork Belly Steamed Rice with Assorted Vegetables', nameMm: 'အခေါက်ကင်ထမင်းပေါင်း', image: 'https://images.deliveryhero.io/image/fd-mm/products/65261.jpg?width=360&height=260', meats: ['ဝက်'] },
  { id: 'grilled-meat-steamed-rice', name: 'Grilled Meat Steamed Rice with Assorted Vegetables', nameMm: 'အသားကင်ထမင်းပေါင်း', image: 'https://images.deliveryhero.io/image/fd-mm/products/65262.jpg?width=360&height=260', meats: ['ဝက်'] },
  { id: 'phat-kaphrao-rice', name: 'Phat Kaphrao Rice', nameMm: 'ဖက်ကဖောင်ထမင်း', image: 'https://images.deliveryhero.io/image/fd-mm/Products/3127307.jpg?width=360&height=260', meats: ['ကြက်', 'ဝက်', 'ပင်လယ်စာ'] }
];

const menuById = new Map(menuItems.map((item) => [item.id, item]));

const blankUser = {
  name: '',
  selectedMenu: null,
  selectedMeat: null,
  selectedSecondMeat: null
};

function loadCachedVotes() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (current && typeof current === 'object' && Object.keys(current).length) {
      return current;
    }

    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
    return legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {};
  } catch {
    return {};
  }
}

function getVoteKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function getMenuLabel(item) {
  if (!item) {
    return 'Selected menu';
  }

  return item.nameMm ? `${item.name} / ${item.nameMm}` : item.name;
}

function formatMeatChoice(meat, secondMeat) {
  if (!meat) {
    return 'Standard serving';
  }

  return secondMeat ? `First: ${meat} | Backup: ${secondMeat}` : `First: ${meat}`;
}

async function saveVoteToApi(vote) {
  const response = await fetch(API_VOTES_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(vote)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to save vote.');
  }

  return data;
}

function App() {
  const [votes, setVotes] = useState(loadCachedVotes);
  const [step, setStep] = useState('register');
  const [nameInput, setNameInput] = useState('');
  const [userState, setUserState] = useState(blankUser);
  const [summaryExisting, setSummaryExisting] = useState(false);
  const [selectedDashboardMenuId, setSelectedDashboardMenuId] = useState(null);
  const [isSavingVote, setIsSavingVote] = useState(false);
  const [toast, setToast] = useState({ message: 'Vote saved', visible: false });
  const toastTimerRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
  }, [votes]);

  useEffect(() => {
    let isActive = true;

    async function refreshVotes() {
      try {
        const response = await fetch(API_VOTES_URL, {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error('Vote API is not available.');
        }

        const data = await response.json();
        if (isActive && data.votes && typeof data.votes === 'object') {
          setVotes(data.votes);
        }
      } catch {
        // Local static previews have no Vercel API, so React keeps using localStorage.
      }
    }

    refreshVotes();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
    }, 1900);
  }, []);

  const dashboard = useMemo(() => {
    const voteList = Object.values(votes);
    const dynamicCounts = menuItems
      .map((item) => {
        const voters = voteList
          .filter((vote) => vote.menuId === item.id)
          .map((vote) => ({
            name: vote.displayName,
            meat: vote.meat || null,
            secondMeat: vote.secondMeat || null
          }));

        return { ...item, voters, count: voters.length };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const highestCount = Math.max(...dynamicCounts.map((item) => item.count), 0);
    const leadingMenu = dynamicCounts.find((item) => item.count === highestCount && item.count > 0);
    const selectedMenu = dynamicCounts.find((item) => item.id === selectedDashboardMenuId) || leadingMenu || dynamicCounts[0];
    const sortedVotes = voteList
      .slice()
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

    return {
      dynamicCounts,
      highestCount,
      selectedMenuId: selectedMenu?.id || null,
      sortedVotes,
      totalVotes: voteList.length
    };
  }, [selectedDashboardMenuId, votes]);

  const goToVoting = useCallback(() => {
    const displayName = normalizeName(nameInput);
    if (!displayName) {
      showToast('Please enter your real name.');
      return;
    }

    const existingVote = votes[getVoteKey(displayName)];
    if (existingVote) {
      setUserState({
        name: displayName,
        selectedMenu: menuById.get(existingVote.menuId) || null,
        selectedMeat: existingVote.meat || null,
        selectedSecondMeat: existingVote.secondMeat || null
      });
      setSummaryExisting(true);
      setStep('summary');
      return;
    }

    setUserState({
      name: displayName,
      selectedMenu: null,
      selectedMeat: null,
      selectedSecondMeat: null
    });
    setSummaryExisting(false);
    setStep('vote');
  }, [nameInput, showToast, votes]);

  const backToName = useCallback(() => {
    setStep('register');
  }, []);

  const startNewGuest = useCallback(() => {
    setUserState(blankUser);
    setNameInput('');
    setSummaryExisting(false);
    setStep('register');
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }, []);

  const selectMenu = useCallback((item) => {
    setUserState((current) => {
      if (current.selectedMenu?.id === item.id) {
        return current;
      }

      return {
        ...current,
        selectedMenu: item,
        selectedMeat: item.meats.length === 1 ? item.meats[0] : null,
        selectedSecondMeat: null
      };
    });
  }, []);

  const selectMeat = useCallback((group, meat) => {
    setUserState((current) => ({
      ...current,
      selectedMeat: group === 'first' ? meat : current.selectedMeat,
      selectedSecondMeat: group === 'second' ? meat : current.selectedSecondMeat
    }));
  }, []);

  const submitVote = useCallback(async (stateOverride) => {
    if (isSavingVote) {
      return;
    }

    const nextState = stateOverride || userState;
    if (!nextState.selectedMenu) {
      showToast('Please choose one menu.');
      return;
    }

    if (nextState.selectedMenu.meats.length > 0 && !nextState.selectedMeat) {
      showToast('Please choose a first meat option.');
      return;
    }

    const vote = {
      displayName: normalizeName(nextState.name),
      menuId: nextState.selectedMenu.id,
      menuName: nextState.selectedMenu.name,
      menuNameMm: nextState.selectedMenu.nameMm,
      meat: nextState.selectedMeat,
      secondMeat: nextState.selectedSecondMeat || null,
      votedAt: new Date().toISOString()
    };

    setIsSavingVote(true);
    setVotes((currentVotes) => ({
      ...currentVotes,
      [getVoteKey(vote.displayName)]: vote
    }));

    try {
      const data = await saveVoteToApi(vote);
      if (data.votes && typeof data.votes === 'object') {
        setVotes(data.votes);
      }
      showToast('Vote saved to Vercel JSON.');
    } catch {
      showToast('Saved on this device. Vercel API is not ready yet.');
    } finally {
      setIsSavingVote(false);
      setSummaryExisting(false);
      setStep('summary');
    }

    if (window.confetti) {
      window.confetti({ particleCount: 80, spread: 62, origin: { y: 0.62 } });
    }
  }, [isSavingVote, showToast, userState]);

  const voteFromCard = useCallback((item) => {
    const nextState = userState.selectedMenu?.id === item.id
      ? userState
      : {
          ...userState,
          selectedMenu: item,
          selectedMeat: item.meats.length === 1 ? item.meats[0] : null,
          selectedSecondMeat: null
        };

    setUserState(nextState);

    if (item.meats.length > 0 && !nextState.selectedMeat) {
      showToast('Please choose a first meat option.');
      return;
    }

    submitVote(nextState);
  }, [showToast, submitVote, userState]);

  const resetVote = useCallback(() => {
    setStep('vote');
  }, []);

  return (
    <>
      <main className="page">
        <header className="event-strip">
          <div className="event-title">
            <span className="brand-mark">100-Day Treat</span>
            <h1>Shinn Thu Thadar Cho</h1>
            <p className="name-mm">သျှင်းသုသဒ္ဓါချို</p>
          </div>
          <div className="event-meta" aria-label="100-day birthday event details">
            <span className="pill">08 . July . 2026</span>
            <span className="pill">100-day birthday</span>
            <span className="pill">Menu vote</span>
          </div>
        </header>

        <section className="app-layout" aria-label="100-day birthday treat voting app">
          <div className="panel vote-panel">
            {step === 'register' ? (
              <RegisterStep
                nameInput={nameInput}
                nameInputRef={nameInputRef}
                onNameChange={setNameInput}
                onViewMenu={goToVoting}
              />
            ) : null}

            {step === 'vote' ? (
              <VoteStep
                isSavingVote={isSavingVote}
                onBack={backToName}
                onSelectMeat={selectMeat}
                onSelectMenu={selectMenu}
                onVoteFromCard={voteFromCard}
                userState={userState}
              />
            ) : null}

            {step === 'summary' ? (
              <SummaryStep
                isExistingVote={summaryExisting}
                onChangeChoice={resetVote}
                onNewGuest={startNewGuest}
                userState={userState}
              />
            ) : null}
          </div>

          <Dashboard
            activeMenuId={dashboard.selectedMenuId}
            dashboard={dashboard}
            onSelectMenu={setSelectedDashboardMenuId}
          />
        </section>
      </main>

      <div className={`toast ${toast.visible ? 'show' : ''}`}>{toast.message}</div>
    </>
  );
}

function RegisterStep({ nameInput, nameInputRef, onNameChange, onViewMenu }) {
  return (
    <div>
      <div className="section-head">
        <span className="eyebrow">Guest entry</span>
        <h2>Choose your menu for my daughter's 100-day birthday treat</h2>
        <p>သမီးလေးရဲ့ ရက် ၁၀၀ ပြည့် အမှတ်တရအတွက် ဧည့်ခံမယ့် အစားအစာကို ရွေးပေးပါ။</p>
      </div>
      <div className="form-group">
        <label htmlFor="username">Your real name</label>
        <input
          ref={nameInputRef}
          type="text"
          id="username"
          placeholder="e.g., Jane Doe"
          autoComplete="name"
          value={nameInput}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onViewMenu();
            }
          }}
        />
      </div>
      <button className="btn btn-primary-wide" type="button" onClick={onViewMenu}>
        View Menu
      </button>
    </div>
  );
}

function VoteStep({ isSavingVote, onBack, onSelectMeat, onSelectMenu, onVoteFromCard, userState }) {
  return (
    <div>
      <div className="section-head">
        <span className="eyebrow">Menu choice</span>
        <h2>{userState.name}, choose your 100-day treat menu</h2>
        <p>Tap the vote icon on a menu card. Meat choices open inside that card when needed.</p>
      </div>

      <div className="menu-grid">
        {menuItems.map((item) => (
          <MenuCard
            isSavingVote={isSavingVote}
            item={item}
            key={item.id}
            onSelectMeat={onSelectMeat}
            onSelectMenu={onSelectMenu}
            onVoteFromCard={onVoteFromCard}
            userState={userState}
          />
        ))}
      </div>

      <div className="action-row">
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function MenuCard({ isSavingVote, item, onSelectMeat, onSelectMenu, onVoteFromCard, userState }) {
  const isSelected = userState.selectedMenu?.id === item.id;
  const meatText = item.meats.length > 1 ? 'Meat options' : item.meats.length === 1 ? item.meats[0] : 'Standard';
  const hasEnoughChoice = item.meats.length === 0 || userState.selectedMeat || item.meats.length === 1;
  const voteTitle = isSelected && hasEnoughChoice ? 'Save this vote' : 'Choose this menu';
  const voteIcon = isSavingVote && isSelected ? '...' : isSelected && hasEnoughChoice ? '✓' : '♡';

  return (
    <article
      className={`menu-card ${isSelected ? 'selected has-controls' : ''}`}
      onClick={() => onSelectMenu(item)}
    >
      <img src={item.image} alt={item.name} loading="lazy" />
      <span className="menu-copy">
        <span className="menu-name">{item.name}</span>
        <span className="menu-mm">{item.nameMm}</span>
        <span className="menu-meta">
          <span className="mini-chip">{meatText}</span>
        </span>
      </span>
      <button
        className="menu-vote-btn"
        type="button"
        title={voteTitle}
        aria-label={voteTitle}
        disabled={isSavingVote}
        onClick={(event) => {
          event.stopPropagation();
          onVoteFromCard(item);
        }}
      >
        {voteIcon}
      </button>
      {isSelected ? (
        <CardOptions
          item={item}
          onSelectMeat={onSelectMeat}
          selectedMeat={userState.selectedMeat}
          selectedSecondMeat={userState.selectedSecondMeat}
        />
      ) : null}
    </article>
  );
}

function CardOptions({ item, onSelectMeat, selectedMeat, selectedSecondMeat }) {
  if (item.meats.length === 0) {
    return (
      <div className="card-options">
        <div className="card-helper">Standard serving. Tap the vote icon to save.</div>
      </div>
    );
  }

  return (
    <div className="card-options" onClick={(event) => event.stopPropagation()}>
      <div className="meat-option-group">
        <div className="field-label">First meat</div>
        <div className="meat-options">
          {item.meats.map((meat) => (
            <MeatButton
              group="first"
              isSelected={selectedMeat === meat}
              key={meat}
              meat={meat}
              onSelectMeat={onSelectMeat}
            />
          ))}
        </div>
      </div>

      {item.meats.length > 1 ? (
        <div className="meat-option-group">
          <div className="field-label">Backup meat</div>
          <div className="meat-options">
            {item.meats.map((meat) => (
              <MeatButton
                group="second"
                isSelected={selectedSecondMeat === meat}
                key={meat}
                meat={meat}
                onSelectMeat={onSelectMeat}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="card-helper">
        {selectedMeat ? 'Tap the vote icon to save this card.' : 'Choose first meat to enable this vote.'}
      </div>
    </div>
  );
}

function MeatButton({ group, isSelected, meat, onSelectMeat }) {
  return (
    <button
      className={`meat-btn ${isSelected ? 'selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelectMeat(group, meat)}
    >
      {meat}
    </button>
  );
}

function SummaryStep({ isExistingVote, onChangeChoice, onNewGuest, userState }) {
  return (
    <div>
      <div className="section-head">
        <span className="eyebrow">Saved choice</span>
        <h2>Thank you for voting</h2>
        <p>သင်ရွေးချယ်ထားသော အစားအစာကို သိမ်းထားပြီးပါပြီ။</p>
      </div>

      <div className="summary-box">
        <p className="summary-user">{userState.name}'s choice</p>
        <p className="summary-dish">{getMenuLabel(userState.selectedMenu)}</p>
        <p>{formatMeatChoice(userState.selectedMeat, userState.selectedSecondMeat)}</p>
      </div>

      <p className="summary-note">
        {isExistingVote
          ? 'This name already has a saved vote. You can update it before the 100-day treat.'
          : 'Your selection is now visible in the dashboard list.'}
      </p>
      <div className="action-row">
        <button className="btn" type="button" onClick={onChangeChoice}>
          Change My Choice
        </button>
        <button className="btn btn-secondary" type="button" onClick={onNewGuest}>
          New Guest
        </button>
      </div>
    </div>
  );
}

function Dashboard({ activeMenuId, dashboard, onSelectMenu }) {
  return (
    <aside className="panel dashboard-panel" aria-label="Treat dashboard">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h2>Live treat list</h2>
        </div>
        <span className="pill">
          {dashboard.totalVotes} vote{dashboard.totalVotes === 1 ? '' : 's'}
        </span>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <span className="stat-number">{dashboard.totalVotes}</span>
          <span className="stat-label">Guests</span>
        </div>
        <div className="stat">
          <span className="stat-number">{dashboard.highestCount}</span>
          <span className="stat-label">Top menu votes</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-block">
          <div className="block-title">Menu ranking</div>
          <div className="rank-list">
            {dashboard.dynamicCounts.map((item) => {
              const isLeading = item.count > 0 && item.count === dashboard.highestCount;
              return (
                <button
                  className={`rank-row ${item.id === activeMenuId ? 'active' : ''}`}
                  key={item.id}
                  type="button"
                  onClick={() => onSelectMenu(item.id)}
                >
                  <span className="rank-top">
                    <span className="rank-name">{isLeading ? 'Top: ' : ''}{item.name}</span>
                    <span className="vote-count">{item.count}</span>
                  </span>
                  <span className="row-meta">
                    {item.nameMm} {item.count > 0 ? `| ${item.count} guest${item.count === 1 ? '' : 's'}` : '| No votes yet'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="dashboard-block">
          <div className="block-title">Guest choices</div>
          <div className="guest-list">
            {dashboard.totalVotes ? (
              dashboard.sortedVotes.map((vote) => {
                const menu = menuById.get(vote.menuId);
                const meatLabel = vote.secondMeat
                  ? `${vote.meat || 'Menu'} / ${vote.secondMeat}`
                  : vote.meat || 'Menu';

                return (
                  <div className="guest-row" key={getVoteKey(vote.displayName)}>
                    <span className="guest-top">
                      <span className="guest-name">{vote.displayName}</span>
                      <span className="vote-count">{meatLabel}</span>
                    </span>
                    <span className="guest-meta">{menu ? getMenuLabel(menu) : vote.menuName}</span>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">Guest choices will appear here after votes are saved.</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default App;
