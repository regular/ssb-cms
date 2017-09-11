# ssb-cms

:hammer: Work in progress :hammer:

ssb is used, among other things, as a social network, to share music, to play chess and to collaborate on code. There is another, similar but different use case: distributed groups collaborating on curating content. This might be teachers collecting learning materials, or a museum organizing content for digital exhibits. While ssb's decentralised nature is not strictly needed for this use case, it is still beneficial. It increases availability, robustness and data reduncany. It also provides a lot of building blocks, such as authentication, encryption and replication.

Collaboratively maintaining a database of content requires manipulating and organizing documents. In ssb-cms, these documents are ssb messages (JSON objects) and the organisational structure is a tree. The `content.branch` and `content.root` properties are used to form the tree structure, just like threads in the social network. Additionally, `content.revisionBranch` and `content.revisionRoot` are being used to be able to mutate (update) documents. See [`ssb-sort (reduce branch)`](http://127.0.0.1:7718/%2533PdKt9pNcyNI2O9AdPXa%2BKwaWfvgv%2F6CfpEd5YmOww%3D.sha256/tree/reduce) for details. (link requires `git ssb web` to be running)

## User Interface, Concepts

![](http://pub.postpossessive.org/ssb-cms-ui.png)

- left: a tree of posts
- middle: a list of revisions for the post selected on the left
- right: the post as json in a code editor (CodeMirror)

### Root
One message is declared the `root` message in `config.cms.root`. WHen the application starts, it displays children of the root message as top-level nodes. With this config option, you can `chroot` clients into a subtree. TODO: toggle visibility of 1st level branches

### Tree view
Nodes in the tree have expand/collapse triangles.

### Revisions
TODO: froks/merges are displayed as a "subway chart" (as in `git lola`).
They show the time stamp (human time), the author's avatar and name and a dot representing the "commit" (a bit like github's fork graph, but vertically).

## Diffs
TODO: When two revisions are selected in the middle column, a diff of the two onjects is displayed.

### Editor
The editor supports syntax highlighting JSON linting.

### Blobs
Files that are dropped onto the editor are added as blobs and their hash is inserted into the text at the place where they were dropped.

### Status bar
TODO: There's a status bar at the top that shows various tiny progress bars (like in Adobe Lightroom) for long-running async processes: sbot syncing, indexing, blob upload (may take long when sbot is remote)

### Drafts
Add and Clone buttons in the tree add a draft for a new message. The draft is an ssb message content object stored in IndexDB (via level.js). There can by an unlimited number of drafts. They are displayed in the tree and revision views, clearly marked as draft. A draft may contain invalid JSON. If it is selected in the tree it is loaded into the editor, like any other message and can be modified. Any modification is immediately stored in IndexDB. If the "Publish" button is pressed and hte message is valid JSON, it is published to ssb.

> NOTE: Currently properties outside the `content` property are ignored when publishing. THe `content` part is passed to `sbot.publish`. The` branch` and `revisionRoot` proerties entered by the user are also ignored and overwritten by values corresponding to the position of the draft in the tree/revision history. (TODO/WIP what about `root` and `revisionBranch`?)

Changing the text of a non-draft message in the editor automatically creates a new draft based off of the currently selected revision. (after the first keystroke, the draft is selected instead of the revision it is based on)

### Commit
Below the editor is a "publish" button, it posts a new message to ssb. This new message might be a revision of an old one. 
TODO (low priority): in the revision column, there is an input field for a comment. Comments are displayed inside the revision column and are filtered out of the tree-view. Comments can be used like commit messages (but are not mandatory) or can be used to discuss changes.

### Names
TODO: clicking (long pressing?) a node id in the tree turns the id into an input field. A name for the message can be entered. Hitting enter publishes an `about` message. When present, names are displayed instead of ids in the tree.
TODO (low priority) same for images/icons.

### Validators
TODO: Before publishing the editor's content, make sure it actually differs from the lates revision and the content is valid json and satisfies a schema or validation function.

### Renderers

Renderers are composable Javascript functions that follow the `hyperobj`
pattern. They take an object as input and generate an HTMLElement.
Renderers can invoke other Renderers to render child nodes (or otherwise
related Nodes). They also provide and add event handlers to the HTML
elements they return.

Renderers can be used to implement in-place editing of content. (e.g. content-editable divs, images are drag-targets). On creation, a renderer receives the ssb api, so it can access the network/database.
TODO: A set of standard renderers are provided for `content.type` `post` and `about` messages. User can provide their own rendering functions to render custom content-tyes.

Renderers either occupy the space of the editor (tabbed UI), or they render the entire view port _behind_ the ssb-cms UI. By pressing Shift-Tab, users can  switch between three modes:

- three-column layout with editor or renderer output on the right
- translucent tree view and revision history UI on top of fullscreen renderer output
- fullscreen renderer output only

### Activity feed
TODO (low priority): Instead of the three column layout (or in addition to it), an activity feed is displayed. Entries like:
- @alice edited %Ancient-Artefact-2343, new revision %124njk12k4
- @bob comments on revision %23j2asds of %Ancient-Artefact-2343 by @alice: "Good work, thanks!"
- @bob identifies %sdkjf3943SHS as %My_cat
- @alice comments on %My_cat: "Nice cat!"

## Installtion

You need [`git-ssb`](https://www.npmjs.com/package/git-ssb) and an instance of [`scuttlebot`](https://www.npmjs.com/package/scuttlebot) running.

```
git clone ssb://%kVEVQSlMwxCtGIR8DDKuo6IkEKCiKD7Tn+8sdnZO3u8=.sha256 ssb-cms
cd ssb-cms
npm i
```
## Configure

You have to specify an `ssb_appname` to run `ssb-cms`. The appname basically is the name of a directory in your home dorectory that contains a `conf` file which specifies the configuration for `ssb-client`. Among other things, it defines an appKey (`in caps.shs`). When you change the appKey from its default value, you are basically in a parallel universe (ssb-wise at least), so this is ideal for exerimenting.

While it is possible to connect to the main (social) ssb network with ssb-cms, I encouraged you to use an alterantive ssb network. I have set up a pub that you can use.

Copy this into a file at `~/.ssb-cms/config`

```

{
  "caps": {
    "shs": "fasELM5JJp+1eGkTUAAFQpmuMpJjgLYhZJfW/TIjdmc="
  },
  "port": 10000,
  "allowPrivate": true,
  "ws": {
    "port": 10001
  },
  "timers": {
    "handshake": 30000
  },
  "master": [
  ],
  "blobs": {
    "legacy": false,
    "sympathy": 10,
    "max": 104857600
  },
  "cms": {
    "root": "%Qmxp+xUtreDtsXk3E8cN05EoJ+dvRztfkdnOiAfGfmc=.sha256"
  }
}
```


## Start sbot

You probably already have an instance of sbot running, either as part of patchwork or stand-alone, but that's not enough! You need another instance running that is using the custom appKey and port numbers from above.

```
$ ssb_appname=ssb-cms sbot server
```

## Connect to pub

```
ssb_appname=ssb-cms sbot invite.accept "pub.postpossessive.org:10000:@W0usBc5dFcUVSShld7ybYveGGhhZ1u6cLwFH6lYPCDo=.ed25519~hQRcUrk2NDX/q3PqIWeqi+q4jwnxgO+vLJ61Ycng6tM="
```

> For this to succeed you need sbot>=10.4.3 (there's a bug in earlier version preventing to accept invitations of sbot instances that don't use the default appKey)

If the invite fails anyway, let me know!

## Run ssb-cms

```
ssb_appname=ssb-cms npm start
```

This loads the configuration file at `~/.ssb-cms/config` and runs a web-server. Copy the URL to your borwser to get started. A bit of expectation management: It will fail. Keep reading!

## Authenticate

`ssb-cms` is a "lite client", i.e. it solely consists of client-side code and communicates with sbot directly, without any custom back-end. However, sbot does not receive commands from unautorized parties just like that. You need to create a key pair, store the private key and instruct `sbot` to listen to commands issued by your public key.

The key pair was created when you first loaded the page. The public key should be displayed on screen, along with instructions of what to do: Insert the public key into `~/.ssb-cms/config`, into the `master` array. Stop and restart `sbot` to load the new config, then reload the page. This time the a connection to sbot should be established.

```
  "master":[
    "@ok/BE7mwDhFryrDWy9cDhd3DUJO3xkBbu4pN2fZD2S8=.ed25519"
  ]
```

## Identity

Note that the public key you just used is not your ssb identity (feed id). It is just your browser's id, sort of a password. Your actual ssb id is in ~/.ssb-cms/secret. You could actually use the secret file from your main (social) id here, just by copying it over:

```
cp ~/.ssb/secret ~/.ssb-cms/secret
```

All browsers connected to this sbot will use the same ssb id. (that's a current limitation of ssb-cms, not sbot)


