// Called by actions/github-script only after all installers have been uploaded.
module.exports = async ({ github, context, manifest }) => {
  const { owner, repo } = context.repo;
  const branch = "download-manifest";
  const path = "latest.json";
  try {
    await github.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: context.sha,
    });
  }
  let sha;
  try {
    const { data } = await github.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });
    if (Array.isArray(data) || data.type !== "file")
      throw new Error("Unexpected manifest path");
    sha = data.sha;
    const previous = JSON.parse(
      Buffer.from(data.content, "base64").toString("utf8"),
    );
    const a = previous.version.split(".").map(Number),
      b = manifest.version.split(".").map(Number);
    const difference = a.findIndex((v, i) => v !== b[i]);
    if (difference !== -1 && a[difference] > b[difference])
      throw new Error("Refusing to replace a newer desktop release");
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await github.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    branch,
    path,
    sha,
    message: `Publish desktop downloads ${manifest.version}`,
    content: Buffer.from(JSON.stringify(manifest, null, 2) + "\n").toString(
      "base64",
    ),
  });
};
