import 'dotenv/config';
import { get, put } from '@vercel/blob';

const {
  BLOB_STORE_ID,
  BLOB_READ_WRITE_TOKEN,
  MAP_API_KEY,
  MAP_BASE_URL
} = process.env;

if (!BLOB_STORE_ID || !BLOB_READ_WRITE_TOKEN) {
  console.warn('Missing environment variables: BLOB_STORE_ID and BLOB_READ_WRITE_TOKEN are required.');
}

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
    return json({ votes });
  } catch (error) {
    return json({ error: 'Unable to load votes.' }, 500);
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
        return json({ error: 'Unable to save vote.' }, 500);
      }
    }
  }

  return json({ error: 'Unable to save vote.' }, 500);
}
