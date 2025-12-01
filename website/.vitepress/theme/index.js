import DefaultTheme from 'vitepress/theme'
import './custom.css'

import googleAnalytics from "vitepress-plugin-google-analytics";
export default {
    ...DefaultTheme,
    enhanceApp: (ctx) => {
        googleAnalytics({
            id: "G-0618B88J59",
        });
    },
};