import { motion } from "framer-motion";

export const Greeting = () => (
  <div className="flex flex-col items-center px-4" key="overview">
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 flex items-center gap-3"
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* biome-ignore lint/performance/noImgElement: logo */}
      <img
        alt="Velcora"
        className="size-10 rounded-xl object-contain"
        src="/velcora-logo.png"
      />
    </motion.div>
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="text-center font-semibold text-2xl tracking-tight text-foreground md:text-3xl"
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      How can Velcora help you today?
    </motion.div>
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 text-center text-muted-foreground/80 text-sm"
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      Select a workflow mode from the sidebar, or ask me anything.
    </motion.div>
  </div>
);
