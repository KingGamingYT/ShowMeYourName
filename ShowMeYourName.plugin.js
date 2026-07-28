/**
 * @name ShowMeYourName
 * @author KingGamingYT & kreed
 * @description Displays a person's username next to their global name/nickname on chat messages.
 * @runAt idle
 * @version 1.1.0
 */ 

const { Data, Webpack, React, Patcher, DOM, UI, Utils } = BdApi;
const { createElement, useState } = React;

// Wrapped in a function (instead of a top-level const) so it can be called again after
// waiting for the module, rather than permanently caching 'undefined' if the relevant
// webpack chunk hadn't loaded yet the first time this ran.
function getMessageModules() {
    return Webpack.getMangled("usernameSpanId", {
        messageHeader: Webpack.Filters.byStrings("SENT_BY_SOCIAL_LAYER_INTEGRATION"),
        default: x => typeof x.type === "function"
    });
}
function isMessageModuleValid(m) {
    return !!m?.default && typeof m.default.type === "function" && typeof m?.messageHeader === "function";
}

const Popout = Webpack.getByStrings("Unsupported animation config:", { searchExports: true });
const GuildMemberStore = Webpack.getStore("GuildMemberStore");
const UserStore = Webpack.getStore("UserStore");

const changelog = {
    changelog: [
        {
            "title": "1.1.0 — Reliability fix",
            "type" : "fixed",
            "items": [
                "Fixed a startup crash ('Patcher.after: 2nd parameter should be module') caused by looking up Discord's internal webpack module once at file-load time. The plugin now waits for the module to actually finish loading before patching.",
                "Errors thrown while rendering the username tag are now caught and logged under '[ShowMeYourName]' in the console, instead of being silently swallowed by BetterDiscord's own Patcher error handling.",
                "If Discord's internals ever change again in a way this plugin can't recover from, it now logs a clear '[ShowMeYourName]' error and disables itself instead of crashing the client."
            ]
        },
        {
            "title": "1.0.0",
            "type" : "improved",
            "items": [
                "Released."
            ]
        }
    ]
};

const styles = Object.assign({},
    Object.getOwnPropertyDescriptors(Webpack.getByKeys('scroller', 'separator', 'iconContainer')),
    Object.getOwnPropertyDescriptors(Webpack.getByKeys('statusPickerModalMenu'))
);

const panelCSS = webpackify(
    `
        span.userTag {
            font-size: 14px;
            color: var(--interactive-text-default);
            &:hover {
                text-decoration: underline;
                cursor: pointer; 
            }
        }
    `
)
function webpackify(css) {
    for (const key in styles) {
        styles[key].value = String(styles[key].value).split(' ', 1)[0];
        let regex = new RegExp(`\\.${key}([\\s,.):>])`, 'g');
        css = css.replace(regex, `.${styles[key].value}$1`);
    }
    return css;
}

module.exports  = class ShowMeYourName {
    constructor(meta){
        this.meta = meta;
        
        const pastVersion = Data.load('ShowMeYourName', 'version');
        this.shouldDisplayChangelog = typeof pastVersion === 'string' ? pastVersion !== this.meta.version : true;
        Data.save('ShowMeYourName', 'version', this.meta.version);
    }
    async start() {
        if (this.shouldDisplayChangelog) {
                UI.showChangelogModal({
                title: this.meta.name + " Changelog",
                subtitle: this.meta.version,
                changes: changelog.changelog,
            });
        }
        DOM.addStyle('showMeYourNameCSS', panelCSS)

        let message = getMessageModules();

        if (!isMessageModuleValid(message)) {
            // Chunk likely hadn't loaded yet (e.g. plugin started before any channel was open).
            console.warn("[ShowMeYourName] Message modules not found yet, waiting for the webpack chunk to load...");
            await Webpack.waitForModule(Webpack.Filters.byStrings("usernameSpanId"));
            message = getMessageModules();
        }

        if (!isMessageModuleValid(message)) {
            console.error("[ShowMeYourName] Still couldn't find the message header modules after waiting. Discord likely changed its internals (the 'usernameSpanId' / 'SENT_BY_SOCIAL_LAYER_INTEGRATION' search strings probably no longer match anything). Skipping patch instead of crashing BetterDiscord - the webpack search filters need updating.");
            return;
        }

        // Logged once per session to help diagnose future breakage without spamming the console.
        let hasLoggedDiagnostics = false;

        Patcher.after("ShowMeYourName", message.default, "type", (that, args, res) => {
            res.type = message.messageHeader;
        });

        Patcher.after('ShowMeYourName', message, 'messageHeader', (that, [props], res) => {
            try {
                const [shouldShowPopout, setShouldShowPopout] = useState(false);
                const options = {
                    walkable: [
                        'props',
                        'children'
                    ],
                    ignore: []
                };
                const messageProps = Utils.findInTree(res, (tree) => tree && Object.hasOwn(tree, 'compact'), options);
                const avatar = Utils.findInTree(res, (tree) => tree && Object.hasOwn(tree, 'avatarUrl'), options);

                if (!hasLoggedDiagnostics) {
                    hasLoggedDiagnostics = true;
                    console.log("[ShowMeYourName] diagnostics — messageProps found:", !!messageProps, messageProps);
                    console.log("[ShowMeYourName] diagnostics — avatar found:", !!avatar, avatar);
                    console.log("[ShowMeYourName] diagnostics — res.props.children:", res?.props?.children);
                }

                if (!messageProps) {
                    console.error("[ShowMeYourName] Could not find messageProps in the render tree (the 'compact' property search matched nothing). Discord likely renamed/restructured this prop. See the diagnostics log above.");
                    return;
                }

                const user = avatar?.user ?? messageProps.message?.author;
                if (!user) {
                    console.error("[ShowMeYourName] Could not resolve a user object (checked avatar.user and messageProps.message.author). See the diagnostics log above.");
                    return;
                }

                const serverMember = GuildMemberStore.getMember(messageProps.channel?.guild_id, user.id);
                const targetChildren = res?.props?.children?.[1]?.props?.children;

                if (!Array.isArray(targetChildren)) {
                    console.error("[ShowMeYourName] res.props.children[1].props.children is not an array (got:", targetChildren, "). Discord likely changed the message header's internal layout, so the insertion point (index [1], splice at 3) needs updating. See the diagnostics log above for the full children structure.");
                    return;
                }

                (serverMember?.nick ?? user.globalName) && (!user.system || user.discriminator !== "0000") && targetChildren.splice(3, 0,
                    createElement(Popout, { ...avatar, onRequestClose: () => setShouldShowPopout(false), shouldShow: shouldShowPopout }, (props) =>
                        createElement('span', { ...props, ref: avatar?.targetElementRef, id: `message-usertag-${messageProps.message.id}`, className: "userTag", onClick: () => setShouldShowPopout(true) }, `@${user.username}`)
                    )
                )
            } catch (err) {
                console.error("[ShowMeYourName] Error while rendering the username tag:", err);
            }
        })
    }

    stop() {
        Patcher.unpatchAll('ShowMeYourName');
        DOM.removeStyle('showMeYourNameCSS');
    }
}
