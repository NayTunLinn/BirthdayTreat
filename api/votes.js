import { get, put } from '@vercel/blob';

const VOTES_PATH = 'birthday-treat/votes.json';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function getStorageStatus() {
  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasOidc = Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);

  return {
    ready: hasReadWriteToken || hasOidc,
    authMode: hasOidc ? 'oidc' : hasReadWriteToken ? 'read-write-token' : 'missing'
  };
}

function assertStorageReady() {
  const status = getStorageStatus();
  if (!status.ready) {
    throw new Error('Vercel Blob is not connected. Connect a Blob store to this Vercel project so BLOB_STORE_ID and VERCEL_OIDC_TOKEN, or BLOB_READ_WRITE_TOKEN, are available.');
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function getVoteKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sanitizeVote(input) {
  const displayName = String(input.displayName || input.name || '').trim().replace(/\s+/g, ' ');
  const menuId = String(input.menuId || '').trim();
  const menuName = String(input.menuName || '').trim();
  const menuNameMm = String(input.menuNameMm || '').trim();
  const meat = input.meat ? String(input.meat).trim() : null;
  const secondMeat = input.secondMeat ? String(input.secondMeat).trim() : null;

  if (!displayName || !menuId || !menuName) {
    return null;
  }

  return {
    displayName: displayName.slice(0, 80),
    menuId: menuId.slice(0, 80),
    menuName: menuName.slice(0, 140),
    menuNameMm: menuNameMm.slice(0, 140),
    meat: meat ? meat.slice(0, 40) : null,
    secondMeat: secondMeat ? secondMeat.slice(0, 40) : null,
    votedAt: new Date().toISOString()
  };
}

async function readVotes() {
  assertStorageReady();

  const result = await get(VOTES_PATH, { access: 'private' });

  if (!result || result.statusCode !== 200 || !result.stream) {
    return { votes: {}, etag: null };
  }

  const text = await new Response(result.stream).text();
  const parsed = text ? JSON.parse(text) : {};
  const votes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

  return {
    votes,
    etag: result.blob?.etag || null
  };
}

async function writeVotes(votes, etag) {
  assertStorageReady();

  const options = {
    access: 'private',
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'application/json; charset=utf-8'
  };

  if (etag) {
    options.ifMatch = etag;
  }

  await put(VOTES_PATH, JSON.stringify(votes, null, 2), options);
}

export async function GET() {
  try {
    const { votes } = await readVotes();
    return json({ votes, storage: getStorageStatus(), path: VOTES_PATH });
  } catch (error) {
    return json({
      error: 'Unable to load votes.',
      details: getErrorMessage(error),
      storage: getStorageStatus(),
      path: VOTES_PATH
    }, 500);
  }
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const vote = sanitizeVote(body);
  if (!vote) {
    return json({ error: 'Name, menuId, and menuName are required.' }, 400);
  }

  const voteKey = getVoteKey(vote.displayName);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { votes, etag } = await readVotes();
      votes[voteKey] = vote;
      await writeVotes(votes, etag);
      return json({ votes, saved: vote });
    } catch (error) {
      const retryable = error?.name === 'BlobPreconditionFailedError' || String(error?.message || '').includes('precondition');
      if (!retryable || attempt === 2) {
        return json({
          error: 'Unable to save vote.',
          details: getErrorMessage(error),
          storage: getStorageStatus(),
          path: VOTES_PATH
        }, 500);
      }
    }
  }

  return json({ error: 'Unable to save vote.' }, 500);
}
