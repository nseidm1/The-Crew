// github.js - GitHub sign-in for the Workspace. It uses GitHub's DEVICE FLOW, which needs no server and no secret: the app shows a
// short code, the customer types it at github.com/login/device and approves, and GitHub hands the token to the app on their machine.
// The only thing this needs is the Client ID of an OAuth App with "Enable Device Flow" ticked (github.com/settings/developers). A Client
// ID is public by design. There is no client secret here, and none is wanted. Until a Client ID is set, the Workspace offers the GitHub
// sign-in already on the machine (the gh command), if there is one.
export const GITHUB = {
  clientId: '',
  scope: 'repo',   // read and write the repositories the customer can reach: the team works on branches there
};
