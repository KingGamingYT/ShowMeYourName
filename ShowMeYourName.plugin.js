/**
 * @name ShowMeYourName
 * @author KingGamingYT
 * @description Displays a person's username next to their global name/nickname on chat messages.
 * @version 1.0.0
 */ 

const { Data, Webpack, React, Patcher, DOM, UI, Utils } = BdApi;
const { createElement, useState } = React;

const message = Webpack.getMangled("usernameSpanId", {
    messageHeader: Webpack.Filters.byStrings("SENT_BY_SOCIAL_LAYER_INTEGRATION"),
    default: x => typeof x.type === "function"
});
const Popout = Webpack.getByStrings("Unsupported animation config:", { searchExports: true });
const GuildMemberStore = Webpack.getStore("GuildMemberStore");
const UserStore = Webpack.getStore("UserStore");

const changelog = {
    changelog: [
        {
            "title": "Changes",
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
    start() {
        if (this.shouldDisplayChangelog) {
                UI.showChangelogModal({
                title: this.meta.name + " Changelog",
                subtitle: this.meta.version,
                changes: changelog.changelog,
            });
        }
        DOM.addStyle('showMeYourNameCSS', panelCSS)

        Patcher.after("ShowMeYourName", message.default, "type", (that, args, res) => {
            res.type = message.messageHeader;
        });

        Patcher.after('ShowMeYourName', message, 'messageHeader', (that, [props], res) => { 
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
            const user = avatar?.user ?? messageProps.message.author;
            const serverMember = GuildMemberStore.getMember(messageProps.channel.guild_id, user.id);

            (serverMember?.nick ?? user.globalName) && (!user.system || user.discriminator !== "0000") && res.props.children[1].props.children.splice(3, 0, 
                createElement(Popout, { ...avatar, onRequestClose: () => setShouldShowPopout(false), shouldShow: shouldShowPopout }, (props) => 
                    createElement('span', { ...props, ref: avatar?.targetElementRef, id: `message-usertag-${messageProps.message.id}`, className: "userTag", onClick: () => setShouldShowPopout(true) }, `@${user.username}`)
                )
            ) 
        })
    }

    stop() {
        Patcher.unpatchAll('ShowMeYourName');
        DOM.removeStyle('showMeYourNameCSS');
    }
}