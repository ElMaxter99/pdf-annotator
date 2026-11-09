import es from '../../i18n/translations/es-ES.json';
import { GUIDE_GROUPS, GUIDE_ICONS, GUIDE_TOPICS } from './guide.data';

describe('guide data', () => {
  const topics = (es as { guide: { topics: Record<string, Record<string, string>> } }).guide.topics;

  it('has unique ids and known groups', () => {
    const ids = GUIDE_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of GUIDE_TOPICS) {
      expect(GUIDE_GROUPS).toContain(topic.group);
      expect(GUIDE_ICONS[topic.icon]).toBeTruthy();
    }
  });

  it('has every text a topic needs in the base language', () => {
    for (const topic of GUIDE_TOPICS) {
      const texts = topics[topic.id];
      expect(texts).withContext(topic.id).toBeDefined();
      const keys = ['title', 'summary', 'tip', ...Array.from({ length: topic.steps }, (_, i) => `s${i + 1}`)];
      for (const key of keys) {
        expect(texts[key]).withContext(`${topic.id}.${key}`).toBeTruthy();
      }
    }
  });

  it('has no texts for topics that do not exist', () => {
    expect(Object.keys(topics).sort()).toEqual(GUIDE_TOPICS.map((t) => t.id).sort());
  });
});
