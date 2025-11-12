/// <reference types="chrome" />
import "./style.css";

interface DanmakuEntry {
	id: string;
	videoId: string;
	content: string;
	seconds: number;
	author: string;
	publishedText: string;
	likeCount: number;
	isPinned: boolean;
}

type StatusTone = "info" | "ready" | "error";

const statusElement = document.querySelector<HTMLElement>('[data-role="status"]');
const listElement = document.querySelector<HTMLUListElement>('[data-role="list"]');
const refreshButton = document.querySelector<HTMLButtonElement>('[data-role="refresh"]');

function formatTimestamp(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(seconds / 3_600);
	const m = Math.floor((seconds % 3_600) / 60);
	const s = seconds % 60;
	if (h > 0) {
		return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
	}
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function setStatus(message: string, tone: StatusTone = "info"): void {
	if (!statusElement) {
		return;
	}
	statusElement.textContent = message;
	statusElement.dataset.tone = tone;
}

function clearList(): void {
	if (!listElement) {
		return;
	}
	while (listElement.firstChild) {
		listElement.removeChild(listElement.firstChild);
	}
}

function renderEntries(entries: DanmakuEntry[]): void {
	if (!statusElement || !listElement) {
		return;
	}
	clearList();
	setStatus(`共 ${entries.length} 条弹幕`, "ready");

	entries.forEach(entry => {
		const item = document.createElement("li");
		item.className = "popup__item";
		item.dataset.id = entry.id;

		const header = document.createElement("div");
		header.className = "popup__item-header";

		const timestamp = document.createElement("span");
		timestamp.className = "popup__timestamp";
		timestamp.textContent = formatTimestamp(entry.seconds);
		timestamp.title = entry.publishedText || "";

		const author = document.createElement("span");
		author.className = "popup__author";
		author.textContent = entry.author || "匿名";

		header.appendChild(timestamp);
		header.appendChild(author);

		if (entry.isPinned) {
			const badge = document.createElement("span");
			badge.className = "popup__badge popup__badge--pin";
			badge.textContent = "置顶";
			header.appendChild(badge);
		}

		if (entry.likeCount > 0) {
			const likes = document.createElement("span");
			likes.className = "popup__meta popup__meta--likes";
			likes.textContent = `👍 ${entry.likeCount}`;
			header.appendChild(likes);
		}

		item.appendChild(header);

		const body = document.createElement("p");
		body.className = "popup__content";
		body.textContent = entry.content;
		item.appendChild(body);

		listElement.appendChild(item);
	});
}

function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
	return new Promise(resolve => {
		chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
			if (tabs && tabs.length > 0) {
				resolve(tabs[0]);
				return;
			}
			chrome.tabs.query({ active: true, currentWindow: true }, fallbackTabs => {
				resolve(fallbackTabs[0] ?? null);
			});
		});
	});
}

function extractVideoIdFromUrl(url?: string | null): string | null {
	if (!url) {
		return null;
	}
	try {
		const parsed = new URL(url);
		if (parsed.hostname.includes("youtu.be")) {
			const idCandidate = parsed.pathname.replace(/^\//, "").trim();
			return idCandidate.length > 0 ? idCandidate : null;
		}
		if (parsed.hostname.includes("youtube.com")) {
			const idCandidate = parsed.searchParams.get("v");
			if (idCandidate) {
				return idCandidate.trim() || null;
			}
		}
	} catch {
		return null;
	}
	return null;
}

async function fetchDanmakuEntries(videoId?: string | null): Promise<DanmakuEntry[]> {
	const payload: { type: "danmaku:popup-data"; videoId?: string } = {
		type: "danmaku:popup-data"
	};
	if (videoId) {
		payload.videoId = videoId;
	}
	const response = await chrome.runtime.sendMessage(payload);
	if (response?.ok && Array.isArray(response.danmaku)) {
		return [...response.danmaku].filter((entry: DanmakuEntry) => entry && typeof entry.id === "string");
	}
	return [];
}

function sortEntries(entries: DanmakuEntry[]): DanmakuEntry[] {
	return entries
		.filter(entry => typeof entry.seconds === "number" && Number.isFinite(entry.seconds))
		.slice()
		.sort((a, b) => a.seconds - b.seconds);
}

async function loadDanmaku(showSpinner = true): Promise<void> {
	if (showSpinner) {
		setStatus("加载中…", "info");
		clearList();
	}

	try {
		const tab = await queryActiveTab();
		const videoId = extractVideoIdFromUrl(tab?.url);
		const entries = sortEntries(await fetchDanmakuEntries(videoId));
		if (entries.length === 0) {
			if (!videoId) {
				setStatus("当前页面不是视频播放", "info");
				clearList();
				return;
			}
			setStatus("暂时没有可显示的弹幕", "info");
			clearList();
			return;
		}
		renderEntries(entries);
	} catch (error) {
		console.error("MyZ Danmaku popup: failed to load entries", error);
		setStatus("加载弹幕时出现错误", "error");
		clearList();
	}
}

refreshButton?.addEventListener("click", () => {
	void loadDanmaku(false);
});

void loadDanmaku();
