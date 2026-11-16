import { useTranslation } from '../i18n';
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"

export function ThemeToggle() {
    const { t } = useTranslation();
    const { setTheme, theme } = useTheme()

    return (
        <Button
            variant="outline"
            size="icon"
            className="relative h-10 w-10 rounded-full border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={theme === "light" ? "light" : "dark"}
                    initial={{ y: -20, opacity: 0, rotate: -90 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: 20, opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.2 }}
                    className="absolute"
                >
                    {theme === "light" ? (
                        <Sun className="h-[1.2rem] w-[1.2rem] text-orange-500" />
                    ) : (
                        <Moon className="h-[1.2rem] w-[1.2rem] text-indigo-400" />
                    )}
                </motion.div>
            </AnimatePresence>
            <span className="sr-only">{t('common.theme')}</span>
        </Button>
    )
}
