import { Octokit } from 'octokit';

const githubConfig = {
  token: process.env.GITHUB_TOKEN, // stored in Vercel Project → Environment Variables
  repo: 'Mrmarthub/serendipai',     // replace with your actual repo
  file: 'subscribers.json',         // stored at root
  branch: 'main'
};

const octokit = new Octokit({
  auth: githubConfig.token
});

export default async function handler(req, res) {
  // CORS header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // Handle CORS preflight
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, timestamp, source } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let subscribers = [];
    let currentSha = null;

    try {
      const response = await octokit.rest.repos.getContent({
        owner: githubConfig.repo.split('/')[0],
        repo: githubConfig.repo.split('/')[1],
        path: githubConfig.file,
        ref: githubConfig.branch
      });

      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
      subscribers = JSON.parse(content);
      currentSha = response.data.sha;
    } catch (error) {
      if (error.status !== 404) {
        console.error('Error loading file:', error);
        return res.status(500).json({ error: 'Unable to load subscriber list' });
      }
      // File not found, we'll create it
    }

    const existing = subscribers.find(
      sub => sub.email.toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      return res.status(409).json({ error: 'Email already subscribed' });
    }

    const newSubscriber = {
      email: email.toLowerCase(),
      subscribedAt: timestamp || new Date().toISOString(),
      source: source || 'website',
      active: true
    };

    subscribers.push(newSubscriber);

    const encodedContent = Buffer.from(
      JSON.stringify(subscribers, null, 2)
    ).toString('base64');

    const updateData = {
      owner: githubConfig.repo.split('/')[0],
      repo: githubConfig.repo.split('/')[1],
      path: githubConfig.file,
      message: `Add subscriber: ${email}`,
      content: encodedContent,
      branch: githubConfig.branch
    };

    if (currentSha) {
      updateData.sha = currentSha;
    }

    await octokit.rest.repos.createOrUpdateFileContents(updateData);

    res.status(200).json({
      success: true,
      message: 'Successfully subscribed',
      totalSubscribers: subscribers.length
    });

  } catch (error) {
    console.error('Newsletter subscription error:', error);
    res.status(500).json({ error: 'Failed to process subscription' });
  }
}
