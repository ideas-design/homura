import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DateTime } from 'luxon';
import { channel } from '../../channel/child';
import { format } from '../../constants/Date';
import { Mode } from '../../constants/Mode';
import { Preset } from '../../constants/Preset';
import { Post, Source } from '../../model/types';
import type { RootState } from '../../store';

type PostKeys = 'id' | 'sourceId' | 'title' | 'unread' | 'starred' | 'link' | 'date';

type PostItem = Pick<Post, PostKeys> & Pick<Source, 'icon' | 'name'>;

type TimeGroup = {
    time: string;
    posts: PostItem[];
};

export type State = {
    posts: PostItem[];
    activeId: number | undefined;
    filter: string;
};

const initialState: State = {
    posts: [],
    activeId: undefined,
    filter: '',
};

export const getListBySourceId = createAsyncThunk(
    'list/getListBySourceId',
    ({ id, mode }: { id: number; mode: Mode }) => {
        const status = mode === Mode.All ? undefined : mode === Mode.Unread ? 'unread' : 'starred';

        return channel.getSourceById(id, status);
    },
);

export const getListByPreset = createAsyncThunk('list/getListByPreset', (preset: Preset) =>
    channel.getPostByPreset(preset),
);

export const markAsUnread = createAsyncThunk(
    'list/markAsUnread',
    async ({ id, unread }: { unread: boolean; id: number }) => {
        await channel.setPostUnread(id, unread);

        return { id, unread };
    },
);

export const markAsStarred = createAsyncThunk(
    'list/markAsStarred',
    async ({ id, starred }: { starred: boolean; id: number }) => {
        await channel.setPostStarred(id, starred);

        return { id, starred };
    },
);

export const markAsRead = createAsyncThunk('list/markAsRead', async (idOrList: number | number[]) => {
    if (typeof idOrList === 'number') {
        await channel.markAllAsReadBySourceId(idOrList);
        return;
    }

    await Promise.all(idOrList.map(channel.markAllAsReadBySourceId));
});

const listSlice = createSlice({
    name: 'list',
    initialState,
    reducers: {
        reset: (state) => {
            state.posts = [];
            state.activeId = undefined;
            state.filter = '';
        },
        setActiveId: (state, action: PayloadAction<number | undefined>) => {
            state.activeId = action.payload;
        },
        setFilter: (state, action: PayloadAction<string>) => {
            state.filter = action.payload;
        },
    },
    extraReducers: (builder) =>
        builder
            .addCase(getListBySourceId.fulfilled, (state, action) => {
                state.posts = action.payload;
            })
            .addCase(getListByPreset.fulfilled, (state, action) => {
                state.posts = action.payload;
            })
            .addCase(markAsUnread.fulfilled, (state, action) => {
                const target = state.posts.find((x) => x.id === action.payload.id);
                if (!target) return;

                target.unread = action.payload.unread;
            })
            .addCase(markAsStarred.fulfilled, (state, action) => {
                const target = state.posts.find((x) => x.id === action.payload.id);
                if (!target) return;

                target.starred = action.payload.starred;
            })
            .addCase(markAsRead.fulfilled, (state) => {
                state.posts.forEach((post) => {
                    post.unread = false;
                });
            }),
});

export const { setActiveId, setFilter, reset } = listSlice.actions;

export const listReducer = listSlice.reducer;

export const selectList = (state: RootState) => {
    const { posts, activeId, filter } = state.list;
    const { activeId: activeSourceId, list: sourceList } = state.source;

    const groups = posts
        .map(({ date, ...x }) => ({
            ...x,
            date: DateTime.fromISO(date),
        }))
        .sort((x, y) => y.date.toSeconds() - x.date.toSeconds())
        .map(({ date, ...x }) => ({
            ...x,
            date: date.toFormat(format),
        }))
        .filter((x) => x.title.toLowerCase().includes(filter.toLowerCase()))
        .reduce((acc: TimeGroup[], cur: PostItem) => {
            const target = acc.find((x) => x.time === cur.date);

            if (!target) {
                return acc.concat({ time: cur.date, posts: [cur] });
            }

            target.posts.push(cur);

            return acc;
        }, []);

    return {
        activeId,
        groups,
        activeSourceId,
        sourceIdList: sourceList.map((x) => x.id),
        mode: state.mode,
    };
};
